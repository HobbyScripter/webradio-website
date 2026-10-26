/**
 * Transactional e-mail delivery.
 *
 * Provider order (first configured wins, never a silent downgrade):
 *
 *   1. Resend HTTPS API  — `RESEND_API_KEY` (+ `EMAIL_FROM`)
 *   2. SMTP              — `EMAIL_SERVER_HOST` (+ `EMAIL_FROM`, optional auth)
 *   3. Local outbox      — development/test only, `.local-db/outbox/`, mode 0600
 *   4. Unconfigured      — production: controlled failure, never a fake success
 *
 * A configured Resend key is authoritative: if `EMAIL_FROM` is missing the
 * message fails with `invalid_config` instead of falling through to SMTP or the
 * outbox. The same applies to a configured Resend key in development — the
 * local outbox is a development convenience, not a hidden fallback.
 *
 * No credential is ever read into client code: this module is server-only and
 * nothing here is prefixed `NEXT_PUBLIC_`.
 *
 * Never log a reset/verification token: logs are shipped and often retained
 * longer than the token is valid. The outbox file is the only local copy and
 * exists solely so the flow can be exercised without a mail server. Provider
 * errors are logged with the provider's stable error *name* and HTTP status
 * only — never the response body, the recipient or the message text.
 */
import crypto from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

/** How the message left the application. */
export type EmailDeliveryMode =
  | 'resend'
  | 'smtp'
  | 'outbox'
  | 'unconfigured'

/** Why a message was not delivered. Stable, non-secret classification. */
export type EmailDeliveryFailure =
  | 'not_configured'
  | 'invalid_config'
  | 'origin_unavailable'
  | 'provider_error'
  | 'timeout'
  | 'network_error'
  | 'outbox_error'

export type EmailDeliveryResult = {
  delivered: boolean;
  mode: EmailDeliveryMode;
  /** Present only when `delivered` is false. */
  failure?: EmailDeliveryFailure;
  /** HTTP status of the provider response, when one was received. */
  providerStatus?: number;
};

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
};

const OUTBOX_DIR = path.join(process.cwd(), '.local-db', 'outbox');

/** Hard limits so a hanging provider cannot hold a request open. */
const RESEND_TIMEOUT_MS = 8_000;
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isResendConfigured(): boolean {
  return readEnv('RESEND_API_KEY') !== undefined;
}

export function isSmtpConfigured(): boolean {
  return Boolean(readEnv('EMAIL_SERVER_HOST') && readEnv('EMAIL_FROM'));
}

/**
 * True when *some* real delivery path is configured. With a Resend key but no
 * `EMAIL_FROM` this is `false`: the configuration is present but unusable.
 */
export function isEmailDeliveryConfigured(): boolean {
  if (isResendConfigured()) {
    return readEnv('EMAIL_FROM') !== undefined;
  }
  return isSmtpConfigured();
}

/**
 * Build the origin used in e-mail links. It comes from configured
 * `NEXTAUTH_URL`, never from the request Host header (which an attacker can
 * forge). Production requires HTTPS except for an explicit loopback
 * development origin.
 */
export function getAuthLinkOrigin(): string | null {
  const raw = process.env['NEXTAUTH_URL']?.trim();
  const fallback =
    process.env['NODE_ENV'] !== 'production' ? 'http://localhost:3000' : null;

  if (!raw) {
    return fallback;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fallback;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fallback;
  }

  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (
    process.env['NODE_ENV'] === 'production' &&
    url.protocol !== 'https:' &&
    !loopbackHosts.has(url.hostname)
  ) {
    return null;
  }

  return url.origin;
}

export function buildAuthLink(pathname: string, token: string): string | null {
  const origin = getAuthLinkOrigin();
  if (!origin) {
    return null;
  }

  try {
    const url = new URL(pathname, `${origin}/`);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    return null;
  }
}

async function writeToOutbox(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  try {
    await mkdir(OUTBOX_DIR, { recursive: true, mode: 0o700 });
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.txt`;
    const body = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      '',
      message.text,
      '',
    ].join('\n');

    await writeFile(path.join(OUTBOX_DIR, filename), body, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });

    return { delivered: true, mode: 'outbox' };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error('[email] could not write local outbox', { name });
    return { delivered: false, mode: 'outbox', failure: 'outbox_error' };
  }
}

/**
 * Read only the stable, non-secret fields of a provider error response.
 * Resend returns `{ name, message }`; `message` may echo the recipient, so it
 * is never read.
 */
async function readProviderErrorName(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === 'object' && body !== null && 'name' in body) {
      const name = (body as { name: unknown }).name;
      if (typeof name === 'string' && name.length <= 64) {
        return name;
      }
    }
  } catch {
    // Non-JSON error body: the status code is enough.
  }
  return undefined;
}

async function sendResend(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  const apiKey = readEnv('RESEND_API_KEY');
  const from = readEnv('EMAIL_FROM');

  if (!apiKey || !from) {
    // Configured-but-unusable is an operator error, not a reason to silently
    // try SMTP or write to the outbox.
    console.error('[email] RESEND_API_KEY is set but EMAIL_FROM is missing');
    return { delivered: false, mode: 'resend', failure: 'invalid_config' };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      // Deterministic timeout, no retry: a retried request would duplicate mail.
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const timedOut =
      name === 'TimeoutError' || name === 'AbortError' || name === 'AbortSignal';
    // Never log the URL, the recipient or the fetch error message.
    console.error('[email] Resend request failed', {
      name,
      reason: timedOut ? 'timeout' : 'network_error',
    });
    return {
      delivered: false,
      mode: 'resend',
      failure: timedOut ? 'timeout' : 'network_error',
    };
  }

  if (!response.ok) {
    const providerName = await readProviderErrorName(response);
    console.error('[email] Resend rejected the message', {
      status: response.status,
      providerError: providerName ?? 'UNKNOWN',
    });
    return {
      delivered: false,
      mode: 'resend',
      failure: 'provider_error',
      providerStatus: response.status,
    };
  }

  // 2xx is the provider's acceptance of the message, not proof of inbox
  // delivery (bounces and suppressions are visible only in the dashboard).
  return { delivered: true, mode: 'resend' };
}

async function sendSmtp(message: TransactionalEmail): Promise<EmailDeliveryResult> {
  const host = readEnv('EMAIL_SERVER_HOST');
  const from = readEnv('EMAIL_FROM');
  const port = Number(process.env['EMAIL_SERVER_PORT'] ?? '587');
  const user = readEnv('EMAIL_SERVER_USER');
  const password = process.env['EMAIL_SERVER_PASSWORD'];

  if (!host || !from) {
    return { delivered: false, mode: 'unconfigured', failure: 'not_configured' };
  }

  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

  try {
    transport = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      requireTLS: port !== 465,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });

    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });

    return { delivered: true, mode: 'smtp' };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'UNKNOWN';
    // Never include the recipient, SMTP response or message body.
    console.error('[email] SMTP delivery failed', { name, code });
    return { delivered: false, mode: 'smtp', failure: 'provider_error' };
  } finally {
    // Release the socket: a serverless instance must not keep an idle SMTP
    // connection alive after the request finished.
    transport?.close();
  }
}

/**
 * Deliver one transactional message.
 *
 * Callers always answer the HTTP request generically; the returned result is
 * for logs and tests only. It is never surfaced to the client, so a missing
 * mailbox can not be distinguished from a delivery outage.
 */
export async function sendTransactionalEmail(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  if (isResendConfigured()) {
    return sendResend(message);
  }

  if (isSmtpConfigured()) {
    return sendSmtp(message);
  }

  if (process.env['NODE_ENV'] !== 'production') {
    return writeToOutbox(message);
  }

  console.error(
    '[email] delivery is not configured; no transactional mail was sent',
  );
  return { delivered: false, mode: 'unconfigured', failure: 'not_configured' };
}

function withLink(
  link: string | null,
  build: (link: string) => TransactionalEmail,
): Promise<EmailDeliveryResult> {
  if (!link) {
    console.error('[email] no safe NEXTAUTH_URL for auth link');
    return Promise.resolve({
      delivered: false,
      mode: 'unconfigured',
      failure: 'origin_unavailable',
    });
  }
  return sendTransactionalEmail(build(link));
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<EmailDeliveryResult> {
  const link = buildAuthLink('/auth/reset-password', token);

  return withLink(link, (url) => ({
    to,
    subject: 'WebRadio: Passwort zurücksetzen',
    text: [
      'Für dein WebRadio-Konto wurde ein Passwort-Reset angefordert.',
      '',
      'Link zum Festlegen eines neuen Passworts (60 Minuten gültig):',
      url,
      '',
      'Wenn du das nicht angefordert hast, ignoriere diese Nachricht. Dein',
      'Passwort bleibt dann unverändert.',
    ].join('\n'),
  }));
}

export async function sendEmailVerificationEmail(
  to: string,
  token: string,
): Promise<EmailDeliveryResult> {
  const link = buildAuthLink('/auth/verify-email', token);

  return withLink(link, (url) => ({
    to,
    subject: 'WebRadio: E-Mail-Adresse bestätigen',
    text: [
      'Bitte bestätige die E-Mail-Adresse für dein WebRadio-Konto.',
      '',
      'Bestätigungslink (24 Stunden gültig):',
      url,
      '',
      'Wenn du kein Konto erstellt hast, ignoriere diese Nachricht.',
    ].join('\n'),
  }));
}

/** Test helper; not exposed over HTTP. */
export function getOutboxDirectory(): string {
  return OUTBOX_DIR;
}
