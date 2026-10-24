/**
 * Transactional e-mail delivery.
 *
 * Production uses SMTP via the existing `EMAIL_SERVER_*` variables. No
 * provider-specific SDK is required, and no credential is ever read into
 * client code. Without SMTP configuration, development/test writes messages to
 * `.local-db/outbox/` (git-ignored, mode 0600) instead of logging a token.
 *
 * Never log a reset/verification token: logs are shipped and often retained
 * longer than the token is valid. The outbox file is the only local copy and
 * exists solely so the flow can be exercised without a mail server.
 */
import crypto from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

export type EmailDeliveryResult = {
  delivered: boolean;
  mode: 'smtp' | 'outbox' | 'unconfigured';
};

const OUTBOX_DIR = path.join(process.cwd(), '.local-db', 'outbox');

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(
    process.env['EMAIL_SERVER_HOST']?.trim() && process.env['EMAIL_FROM']?.trim(),
  );
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

async function writeToOutbox(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailDeliveryResult> {
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
}

async function sendSmtp(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailDeliveryResult> {
  const host = process.env['EMAIL_SERVER_HOST']?.trim();
  const from = process.env['EMAIL_FROM']?.trim();
  const port = Number(process.env['EMAIL_SERVER_PORT'] ?? '587');
  const user = process.env['EMAIL_SERVER_USER']?.trim();
  const password = process.env['EMAIL_SERVER_PASSWORD'];

  if (!host || !from) {
    return { delivered: false, mode: 'unconfigured' };
  }

  try {
    const transport = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      requireTLS: port !== 465,
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
    return { delivered: false, mode: 'smtp' };
  }
}

/**
 * Deliver one transactional message. Missing SMTP configuration is not an
 * exception: callers return a generic response and the flow remains
 * non-enumerable.
 */
export async function sendTransactionalEmail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailDeliveryResult> {
  if (isEmailDeliveryConfigured()) {
    return sendSmtp(message);
  }

  if (process.env['NODE_ENV'] !== 'production') {
    try {
      return await writeToOutbox(message);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      console.error('[email] could not write local outbox', { name });
      return { delivered: false, mode: 'outbox' };
    }
  }

  console.error(
    '[email] delivery is not configured; no transactional mail was sent',
  );
  return { delivered: false, mode: 'unconfigured' };
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<EmailDeliveryResult> {
  const link = buildAuthLink('/auth/reset-password', token);
  if (!link) {
    console.error('[email] no safe NEXTAUTH_URL for password-reset link');
    return { delivered: false, mode: 'unconfigured' };
  }

  return sendTransactionalEmail({
    to,
    subject: 'WebRadio: Passwort zurücksetzen',
    text: [
      'Für dein WebRadio-Konto wurde ein Passwort-Reset angefordert.',
      '',
      `Link zum Festlegen eines neuen Passworts (60 Minuten gültig):`,
      link,
      '',
      'Wenn du das nicht angefordert hast, ignoriere diese Nachricht. Dein',
      'Passwort bleibt dann unverändert.',
    ].join('\n'),
  });
}

export async function sendEmailVerificationEmail(
  to: string,
  token: string,
): Promise<EmailDeliveryResult> {
  const link = buildAuthLink('/auth/verify-email', token);
  if (!link) {
    console.error('[email] no safe NEXTAUTH_URL for verification link');
    return { delivered: false, mode: 'unconfigured' };
  }

  return sendTransactionalEmail({
    to,
    subject: 'WebRadio: E-Mail-Adresse bestätigen',
    text: [
      'Bitte bestätige die E-Mail-Adresse für dein WebRadio-Konto.',
      '',
      'Bestätigungslink (24 Stunden gültig):',
      link,
      '',
      'Wenn du kein Konto erstellt hast, ignoriere diese Nachricht.',
    ].join('\n'),
  });
}

/** Test helper; not exposed over HTTP. */
export function getOutboxDirectory(): string {
  return OUTBOX_DIR;
}
