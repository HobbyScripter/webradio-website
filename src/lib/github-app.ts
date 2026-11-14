import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import 'temporal-polyfill/global';
import type * as DbModule from './db';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('./db');
  return mod.db;
}

export const GITHUB_REPOSITORY = 'YourEliteSystems/WebRadio' as const;

export type GitHubAppConfig = {
  appId: string | null;
  clientId: string | null;
  installationId: string | null;
  privateKey: string | null;
  webhookSecret: string | null;
  fallbackToken: string | null;
};

export function getGitHubAppConfig(): GitHubAppConfig {
  const appId = process.env['GITHUB_APP_ID']?.trim() || null;
  const clientId = process.env['GITHUB_CLIENT_ID']?.trim() || null;
  const installationId = process.env['GITHUB_INSTALLATION_ID']?.trim() || null;
  let privateKey = process.env['GITHUB_APP_PRIVATE_KEY']?.trim() || null;
  if (privateKey) {
    // Support private key passed with literal \n escapes or base64 encoded
    if (!privateKey.includes('-----BEGIN') && !privateKey.includes('\n')) {
      try {
        const decoded = Buffer.from(privateKey, 'base64').toString('utf8');
        if (decoded.includes('-----BEGIN')) {
          privateKey = decoded;
        }
      } catch {
        // keep as is
      }
    } else {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
  }
  const webhookSecret = process.env['GITHUB_WEBHOOK_SECRET']?.trim() || null;
  const fallbackToken = process.env['GITHUB_TOKEN']?.trim() || null;

  return {
    appId,
    clientId,
    installationId,
    privateKey,
    webhookSecret,
    fallbackToken,
  };
}

/**
 * Encodes an object to base64url for JWT construction
 */
function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

/**
 * Creates an RS256 signed JWT for GitHub App authentication (valid for 10 minutes max).
 */
export function generateGitHubAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iat: now - 60, // 60s clock skew
    exp: now + 9 * 60, // 9 minutes
    iss: appId,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign('RSA-SHA256');
  signer.update(dataToSign);
  signer.end();

  const signature = signer.sign(privateKeyPem);
  const encodedSignature = base64UrlEncode(signature);

  return `${dataToSign}.${encodedSignature}`;
}

type CachedInstallationToken = {
  token: string;
  expiresAtMs: number;
  installationId: string;
  permissions?: Record<string, string>;
  repository?: string;
};

let cachedToken: CachedInstallationToken | null = null;

/**
 * Fetches a GitHub App Installation Access Token or falls back to GITHUB_TOKEN if App not configured.
 */
export async function getInstallationAccessToken(): Promise<{
  token: string | null;
  source: 'github-app' | 'fallback-token' | 'unauthenticated';
  expiresAt?: string;
}> {
  const config = getGitHubAppConfig();

  if (config.appId && config.installationId && config.privateKey) {
    const now = Date.now();
    // Re-use cached token if it has at least 2 minutes lifetime left
    if (
      cachedToken &&
      cachedToken.installationId === config.installationId &&
      cachedToken.expiresAtMs - now > 2 * 60 * 1000
    ) {
      return {
        token: cachedToken.token,
        source: 'github-app',
        expiresAt: new Date(cachedToken.expiresAtMs).toISOString(),
      };
    }

    try {
      const jwt = generateGitHubAppJwt(config.appId, config.privateKey);
      const url = `https://api.github.com/app/installations/${config.installationId}/access_tokens`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'User-Agent': 'webradio-website/0.1 (+https://github.com/YourEliteSystems/WebRadio)',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (response.ok) {
        const body = (await response.json()) as {
          token: string;
          expires_at: string;
          permissions?: Record<string, string>;
          repositories?: { full_name: string }[];
        };
        const expiresAtMs = Date.parse(body.expires_at);

        cachedToken = {
          token: body.token,
          expiresAtMs,
          installationId: config.installationId,
          permissions: body.permissions,
        };

        // Asynchronously update lastApiCallAt in database if installation record exists
        recordApiCall(config.installationId).catch(() => {});

        return {
          token: body.token,
          source: 'github-app',
          expiresAt: body.expires_at,
        };
      } else {
        console.warn(`GitHub App token request failed with HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('Failed to obtain GitHub App installation access token:', err);
    }
  }

  if (config.fallbackToken) {
    return {
      token: config.fallbackToken,
      source: 'fallback-token',
    };
  }

  return {
    token: null,
    source: 'unauthenticated',
  };
}

async function recordApiCall(installationIdStr: string): Promise<void> {
  try {
    const db = await getDb();
    const instId = BigInt(installationIdStr);
    await db.orm.public.GitHubAppInstallation.where({ installationId: instId }).update({
      lastApiCallAt: Temporal.Now.instant(),
    });
  } catch {
    // Ignore db logging errors in background
  }
}

/**
 * Validates HMAC SHA256 Webhook signature from GitHub
 */
export function verifyGitHubWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const signatureHex = signatureHeader.slice(expectedPrefix.length);
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const calculatedHex = hmac.digest('hex');

  const sigBuf = Buffer.from(signatureHex, 'hex');
  const calcBuf = Buffer.from(calculatedHex, 'hex');

  if (sigBuf.length !== calcBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, calcBuf);
}

/**
 * Idempotently records a webhook delivery to guard against duplicate replay processing.
 * Returns true if this is the first time the delivery is processed, false if already processed.
 */
export async function claimWebhookDelivery(
  deliveryId: string,
  event: string,
  action?: string | null,
  repository?: string | null,
): Promise<boolean> {
  if (!deliveryId) return false;

  try {
    const db = await getDb();
    const existing = await db.orm.public.GitHubWebhookDelivery.first({ deliveryId });
    if (existing) {
      return false; // Already handled
    }

    await db.orm.public.GitHubWebhookDelivery.create({
      deliveryId,
      event,
      action: action ?? null,
      repository: repository ?? null,
      processedAt: Temporal.Now.instant(),
    });

    return true;
  } catch {
    // In case of race condition collision on unique index
    return false;
  }
}

export type IntegrationStatusInfo = {
  configured: boolean;
  mode: 'github-app' | 'personal-access-token' | 'none';
  appId: string | null;
  clientId: string | null;
  installationId: string | null;
  appName: string | null;
  accountLogin: string | null;
  repository: string;
  status: 'CONNECTED' | 'SUSPENDED' | 'DELETED' | 'NOT_CONFIGURED';
  permissions: Record<string, string> | null;
  lastApiCallAt: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
};

/**
 * Returns current status of GitHub App integration for the admin dashboard.
 */
export async function getGitHubIntegrationStatus(): Promise<IntegrationStatusInfo> {
  const config = getGitHubAppConfig();
  const db = await getDb();

  const repository = GITHUB_REPOSITORY;

  if (!config.appId && !config.fallbackToken) {
    return {
      configured: false,
      mode: 'none',
      appId: null,
      clientId: null,
      installationId: null,
      appName: null,
      accountLogin: null,
      repository,
      status: 'NOT_CONFIGURED',
      permissions: null,
      lastApiCallAt: null,
      lastWebhookAt: null,
      lastError: 'Keine GitHub App-Konfiguration oder Fallback-Token vorhanden.',
    };
  }

  if (config.appId && config.installationId) {
    const instId = BigInt(config.installationId);
    let record = null;
    try {
      record = await db.orm.public.GitHubAppInstallation.first({ installationId: instId });
    } catch {
      // Table may not have record yet
    }

    let permissions: Record<string, string> | null = null;
    if (record?.permissions) {
      try {
        permissions = JSON.parse(record.permissions);
      } catch {
        // ignore
      }
    }

    return {
      configured: true,
      mode: 'github-app',
      appId: config.appId,
      clientId: config.clientId,
      installationId: config.installationId,
      appName: record?.appName ?? 'WebRadio GitHub App',
      accountLogin: record?.accountLogin ?? 'YourEliteSystems',
      repository,
      status: (record?.status as IntegrationStatusInfo['status']) ?? 'CONNECTED',
      permissions,
      lastApiCallAt: record?.lastApiCallAt ? new Date(record.lastApiCallAt.toString()).toISOString() : null,
      lastWebhookAt: record?.lastWebhookAt ? new Date(record.lastWebhookAt.toString()).toISOString() : null,
      lastError: null,
    };
  }

  return {
    configured: true,
    mode: 'personal-access-token',
    appId: null,
    clientId: null,
    installationId: null,
    appName: 'Personal Access Token / GITHUB_TOKEN',
    accountLogin: 'YourEliteSystems',
    repository,
    status: 'CONNECTED',
    permissions: { contents: 'read' },
    lastApiCallAt: null,
    lastWebhookAt: null,
    lastError: null,
  };
}

