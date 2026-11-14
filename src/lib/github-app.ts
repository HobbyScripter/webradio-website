import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import 'temporal-polyfill/global';
import type * as DbModule from './db';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('./db');
  return mod.db;
}

export const GITHUB_REPOSITORY = 'YourEliteSystems/WebRadio' as const;

const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_CHECK_TIMEOUT_MS = 8_000;

/** Headers shared by all GitHub API calls. Never contains a token itself. */
function githubApiHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'webradio-website/0.1 (+https://github.com/YourEliteSystems/WebRadio)',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

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
 * Algorithm GitHub requires for App JWTs.
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 */
export const GITHUB_APP_JWT_ALGORITHM = 'RS256' as const;

/**
 * GitHub rejects an `exp` more than 10 minutes in the future; the whole window
 * (`exp - iat`) therefore stays at exactly 10 minutes.
 */
export const GITHUB_APP_JWT_MAX_LIFETIME_SECONDS = 10 * 60;

/** GitHub recommends backdating `iat` by 60 seconds to tolerate clock drift. */
export const GITHUB_APP_JWT_CLOCK_DRIFT_SECONDS = 60;

export type GitHubAppJwtOptions = {
  /** Unix timestamp in seconds; injectable so tests can assert the claims exactly. */
  nowSeconds?: number;
};

/**
 * Creates the RS256 JWT that authenticates as the GitHub App.
 *
 * `iss` MUST be the GitHub App **client ID** (recommended by GitHub and the value
 * this project configures as `GITHUB_CLIENT_ID`), never the numeric App ID. The
 * App ID is only an identifier for the settings page and the admin dashboard.
 *
 * Claims: `iat` is 60s in the past, `exp` is 9 minutes in the future (10 minute
 * maximum window), signed with the App's private PEM key.
 */
export function generateGitHubAppJwt(
  clientId: string,
  privateKeyPem: string,
  options: GitHubAppJwtOptions = {},
): string {
  const issuer = clientId?.trim();
  if (!issuer) {
    throw new Error('GitHub App JWT requires the App client ID as issuer (GITHUB_CLIENT_ID).');
  }
  if (!privateKeyPem?.includes('-----BEGIN')) {
    throw new Error('GitHub App JWT requires a PEM encoded private key (GITHUB_APP_PRIVATE_KEY).');
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = {
    alg: GITHUB_APP_JWT_ALGORITHM,
    typ: 'JWT',
  };
  const payload = {
    iat: now - GITHUB_APP_JWT_CLOCK_DRIFT_SECONDS,
    exp: now - GITHUB_APP_JWT_CLOCK_DRIFT_SECONDS + GITHUB_APP_JWT_MAX_LIFETIME_SECONDS,
    iss: issuer,
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
  /** Client ID that issued the JWT, so a configuration change invalidates the cache. */
  issuer: string;
  permissions?: Record<string, string>;
  repository?: string;
};

let cachedToken: CachedInstallationToken | null = null;

/** Test hook: the installation token cache is process wide. */
export function __resetGitHubAppTokenCacheForTests(): void {
  cachedToken = null;
}

/**
 * Fetches a GitHub App Installation Access Token or falls back to GITHUB_TOKEN if App not configured.
 */
export async function getInstallationAccessToken(): Promise<{
  token: string | null;
  source: 'github-app' | 'fallback-token' | 'unauthenticated';
  expiresAt?: string;
}> {
  const config = getGitHubAppConfig();

  // The JWT is issued with the client ID. The App ID is a separate value and is
  // deliberately NOT used as a fallback issuer (see GITHUB_APP_SETUP.md).
  if (config.clientId && config.installationId && config.privateKey) {
    const now = Date.now();
    // Re-use cached token if it has at least 2 minutes lifetime left
    if (
      cachedToken &&
      cachedToken.installationId === config.installationId &&
      cachedToken.issuer === config.clientId &&
      cachedToken.expiresAtMs - now > 2 * 60 * 1000
    ) {
      return {
        token: cachedToken.token,
        source: 'github-app',
        expiresAt: new Date(cachedToken.expiresAtMs).toISOString(),
      };
    }

    try {
      const jwt = generateGitHubAppJwt(config.clientId, config.privateKey);
      // The installation ID is what identifies the installation whose token is
      // exchanged; the JWT alone only proves the App identity.
      const url = `https://api.github.com/app/installations/${config.installationId}/access_tokens`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...githubApiHeaders(),
          Authorization: `Bearer ${jwt}`,
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
          issuer: config.clientId,
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
  } else if (config.installationId && config.privateKey && !config.clientId) {
    console.warn(
      'GitHub App is missing GITHUB_CLIENT_ID. The JWT issuer is the App client ID; ' +
        'the App ID (GITHUB_APP_ID) is not used as a fallback, so no installation token is requested.',
    );
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

export type GitHubAppCheckStage = 'config' | 'token' | 'repository' | 'releases';

export type GitHubAppCheckCode =
  | 'OK'
  | 'NOT_CONFIGURED'
  | 'INVALID_PRIVATE_KEY'
  | 'INVALID_JWT'
  | 'INSTALLATION_NOT_FOUND'
  | 'FORBIDDEN'
  | 'REPOSITORY_NOT_ACCESSIBLE'
  | 'API_ERROR';

export type GitHubAppConnectionCheck = {
  ok: boolean;
  code: GitHubAppCheckCode;
  stage: GitHubAppCheckStage;
  message: string;
  httpStatus: number | null;
  repository: string;
  checkedAt: string;
  tokenExpiresAt: string | null;
};

/**
 * Read-only connection check for the admin dashboard.
 *
 * Steps: sign a client-ID JWT, exchange it for an installation token, then read
 * the repository metadata with that token. No token, private key or response
 * body is returned or logged; the result only carries a stable code, the
 * failing stage and the HTTP status. Two GET/POST calls, no writes.
 */
export async function checkGitHubAppConnection(): Promise<GitHubAppConnectionCheck> {
  const config = getGitHubAppConfig();
  const repository = GITHUB_REPOSITORY;
  const base = {
    repository,
    checkedAt: new Date().toISOString(),
    httpStatus: null as number | null,
    tokenExpiresAt: null as string | null,
  };

  const missing: string[] = [];
  if (!config.clientId) missing.push('GITHUB_CLIENT_ID');
  if (!config.installationId) missing.push('GITHUB_INSTALLATION_ID');
  if (!config.privateKey) missing.push('GITHUB_APP_PRIVATE_KEY');

  if (missing.length > 0) {
    return {
      ...base,
      ok: false,
      code: 'NOT_CONFIGURED',
      stage: 'config',
      message: `Fehlende Konfiguration: ${missing.join(', ')}.`,
    };
  }

  const clientId = config.clientId!;
  const installationId = config.installationId!;
  const privateKey = config.privateKey!;

  if (!/^\d+$/.test(installationId)) {
    return {
      ...base,
      ok: false,
      code: 'INSTALLATION_NOT_FOUND',
      stage: 'config',
      message: 'GITHUB_INSTALLATION_ID ist nicht numerisch.',
    };
  }

  if (!privateKey.includes('-----BEGIN')) {
    return {
      ...base,
      ok: false,
      code: 'INVALID_PRIVATE_KEY',
      stage: 'config',
      message: 'GITHUB_APP_PRIVATE_KEY ist kein PEM-Schlüssel.',
    };
  }

  let jwt: string;
  try {
    jwt = generateGitHubAppJwt(clientId, privateKey);
  } catch {
    return {
      ...base,
      ok: false,
      code: 'INVALID_PRIVATE_KEY',
      stage: 'config',
      message: 'Das JWT konnte nicht signiert werden; Private Key prüfen.',
    };
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: { ...githubApiHeaders(), Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(GITHUB_CHECK_TIMEOUT_MS),
        cache: 'no-store',
      },
    );
  } catch {
    return {
      ...base,
      ok: false,
      code: 'API_ERROR',
      stage: 'token',
      message: 'GitHub war nicht erreichbar (Netzwerk oder Timeout).',
    };
  }

  if (!tokenResponse.ok) {
    const status = tokenResponse.status;
    if (status === 401) {
      return {
        ...base,
        httpStatus: status,
        ok: false,
        code: 'INVALID_JWT',
        stage: 'token',
        message: 'GitHub hat das JWT abgelehnt: Client ID und Private Key passen nicht zur App.',
      };
    }
    if (status === 404) {
      return {
        ...base,
        httpStatus: status,
        ok: false,
        code: 'INSTALLATION_NOT_FOUND',
        stage: 'token',
        message: 'Installation ID nicht gefunden oder App ist dort nicht installiert.',
      };
    }
    if (status === 403) {
      return {
        ...base,
        httpStatus: status,
        ok: false,
        code: 'FORBIDDEN',
        stage: 'token',
        message: 'GitHub hat den Token-Request verweigert: Installation gesperrt oder Rechte fehlen.',
      };
    }
    return {
      ...base,
      httpStatus: status,
      ok: false,
      code: 'API_ERROR',
      stage: 'token',
      message: `GitHub API antwortete mit HTTP ${status}.`,
    };
  }

  let tokenBody: { token?: unknown; expires_at?: unknown };
  try {
    tokenBody = (await tokenResponse.json()) as { token?: unknown; expires_at?: unknown };
  } catch {
    return {
      ...base,
      httpStatus: 200,
      ok: false,
      code: 'API_ERROR',
      stage: 'token',
      message: 'Antwort des Token-Endpunkts war kein lesbares JSON.',
    };
  }

  const installationToken = typeof tokenBody.token === 'string' ? tokenBody.token : null;
  if (!installationToken) {
    return {
      ...base,
      httpStatus: 200,
      ok: false,
      code: 'API_ERROR',
      stage: 'token',
      message: 'Antwort enthielt kein Installation Token.',
    };
  }
  const tokenExpiresAt = typeof tokenBody.expires_at === 'string' ? tokenBody.expires_at : null;

  let repositoryResponse: Response;
  try {
    repositoryResponse = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: { ...githubApiHeaders(), Authorization: `Bearer ${installationToken}` },
      signal: AbortSignal.timeout(GITHUB_CHECK_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return {
      ...base,
      ok: false,
      code: 'API_ERROR',
      stage: 'repository',
      message: 'GitHub war nicht erreichbar (Netzwerk oder Timeout).',
    };
  }

  if (!repositoryResponse.ok) {
    const status = repositoryResponse.status;
    const code: GitHubAppCheckCode =
      status === 404 ? 'REPOSITORY_NOT_ACCESSIBLE' : status === 403 ? 'FORBIDDEN' : 'API_ERROR';
    const message =
      status === 404
        ? 'Das Repository ist für die Installation nicht sichtbar (HTTP 404).'
        : status === 403
          ? 'Die Installation hat keinen Lesezugriff auf das Repository (HTTP 403).'
          : `GitHub API antwortete mit HTTP ${status}.`;
    return { ...base, httpStatus: status, ok: false, code, stage: 'repository', message };
  }

  let repositoryBody: { full_name?: unknown };
  try {
    repositoryBody = (await repositoryResponse.json()) as { full_name?: unknown };
  } catch {
    return {
      ...base,
      httpStatus: 200,
      ok: false,
      code: 'API_ERROR',
      stage: 'repository',
      message: 'Antwort des Repository-Endpunkts war kein lesbares JSON.',
    };
  }

  if (
    typeof repositoryBody.full_name !== 'string' ||
    repositoryBody.full_name.toLowerCase() !== repository.toLowerCase()
  ) {
    return {
      ...base,
      httpStatus: 200,
      ok: false,
      code: 'REPOSITORY_NOT_ACCESSIBLE',
      stage: 'repository',
      message: 'GitHub lieferte ein anderes Repository als erwartet.',
    };
  }

  // Read one published release through the installation token: the releases feed
  // is the second read the website depends on.
  let releasesResponse: Response;
  try {
    releasesResponse = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=1`,
      {
        headers: { ...githubApiHeaders(), Authorization: `Bearer ${installationToken}` },
        signal: AbortSignal.timeout(GITHUB_CHECK_TIMEOUT_MS),
        cache: 'no-store',
      },
    );
  } catch {
    return {
      ...base,
      ok: false,
      code: 'API_ERROR',
      stage: 'releases',
      message: 'GitHub war nicht erreichbar (Netzwerk oder Timeout).',
    };
  }

  if (!releasesResponse.ok) {
    const status = releasesResponse.status;
    const code: GitHubAppCheckCode = status === 403 ? 'FORBIDDEN' : 'API_ERROR';
    return {
      ...base,
      httpStatus: status,
      ok: false,
      code,
      stage: 'releases',
      message:
        status === 403
          ? 'Die Installation hat keinen Lesezugriff auf Releases (HTTP 403).'
          : `GitHub API antwortete mit HTTP ${status}.`,
    };
  }

  let releasesBody: unknown;
  try {
    releasesBody = await releasesResponse.json();
  } catch {
    return {
      ...base,
      httpStatus: 200,
      ok: false,
      code: 'API_ERROR',
      stage: 'releases',
      message: 'Antwort des Release-Endpunkts war kein lesbares JSON.',
    };
  }

  if (!Array.isArray(releasesBody)) {
    return {
      ...base,
      httpStatus: 200,
      ok: false,
      code: 'API_ERROR',
      stage: 'releases',
      message: 'Antwort des Release-Endpunkts war keine Liste.',
    };
  }

  // Only a fully successful read is recorded as the last successful API call.
  await recordApiCall(installationId);

  return {
    ...base,
    ok: true,
    code: 'OK',
    stage: 'releases',
    message: `Installation Token erhalten; ${repository} und Releases sind lesbar.`,
    httpStatus: 200,
    tokenExpiresAt,
  };
}

async function recordApiCall(installationIdStr: string): Promise<void> {
  try {
    const db = await getDb();
    const instId = BigInt(installationIdStr);
    const now = Temporal.Now.instant();
    const existing = await db.orm.public.GitHubAppInstallation.first({
      installationId: instId,
    });

    if (existing) {
      await db.orm.public.GitHubAppInstallation.where({ installationId: instId }).update({
        lastApiCallAt: now,
      });
    } else {
      // The installation row is normally created by the `installation` webhook.
      // Without it there would be nowhere to store the timestamp, so the first
      // verified API call creates the minimal record.
      await db.orm.public.GitHubAppInstallation.create({
        installationId: instId,
        appName: 'WebRadio GitHub App',
        accountLogin: 'YourEliteSystems',
        repositoryName: GITHUB_REPOSITORY,
        status: 'CONNECTED',
        lastApiCallAt: now,
      });
    }
  } catch {
    // Ignore db logging errors in background; the check result stays valid.
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
  status: 'CONNECTED' | 'SUSPENDED' | 'DELETED' | 'NOT_CONFIGURED' | 'ERROR';
  permissions: Record<string, string> | null;
  lastApiCallAt: string | null;
  lastWebhookAt: string | null;
  /** Latest stored webhook delivery (signature valid, recorded once). */
  lastWebhookEvent: string | null;
  lastWebhookAction: string | null;
  lastWebhookProcessedAt: string | null;
  webhookConfigured: boolean;
  lastError: string | null;
  /** Result of the read-only live check; null in fallback-token mode. */
  check: GitHubAppConnectionCheck | null;
};

/**
 * Returns current status of GitHub App integration for the admin dashboard.
 */
export async function getGitHubIntegrationStatus(): Promise<IntegrationStatusInfo> {
  const config = getGitHubAppConfig();
  const db = await getDb();

  const repository = GITHUB_REPOSITORY;

  type StoredDelivery = {
    event: string;
    action: string | null;
    processedAt: { toString(): string };
  };
  let lastDelivery: StoredDelivery | null = null;
  try {
    const rows = await db.orm.public.GitHubWebhookDelivery
      .orderBy((delivery) => delivery.processedAt.desc())
      .limit(1)
      .all();
    lastDelivery = (rows[0] as StoredDelivery | undefined) ?? null;
  } catch {
    // The table may not exist yet; the dashboard then shows no webhook.
  }

  const webhookInfo = {
    lastWebhookEvent: lastDelivery?.event ?? null,
    lastWebhookAction: lastDelivery?.action ?? null,
    lastWebhookProcessedAt: lastDelivery?.processedAt
      ? new Date(lastDelivery.processedAt.toString()).toISOString()
      : null,
    webhookConfigured: Boolean(config.webhookSecret),
  };

  const appAuthConfigured = Boolean(
    config.clientId && config.installationId && config.privateKey,
  );

  // Live, read-only verification: JWT -> installation token -> repository read.
  // The dashboard only reports CONNECTED after all three steps succeeded.
  const check = await checkGitHubAppConnection();

  if (!appAuthConfigured && !config.fallbackToken) {
    return {
      configured: false,
      mode: 'none',
      appId: config.appId,
      clientId: config.clientId,
      installationId: config.installationId,
      appName: null,
      accountLogin: null,
      repository,
      ...webhookInfo,
      status: 'NOT_CONFIGURED',
      permissions: null,
      lastApiCallAt: null,
      lastWebhookAt: null,
      lastError: check.message,
      check,
    };
  }

  if (appAuthConfigured && config.clientId && config.installationId) {
    let record = null;
    try {
      const instId = BigInt(config.installationId);
      record = await db.orm.public.GitHubAppInstallation.first({ installationId: instId });
    } catch {
      // Table may not have a record yet, or the id is not numeric
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
      ...webhookInfo,
      status: check.ok
        ? ((record?.status as IntegrationStatusInfo['status']) ?? 'CONNECTED')
        : 'ERROR',
      permissions,
      lastApiCallAt: record?.lastApiCallAt ? new Date(record.lastApiCallAt.toString()).toISOString() : null,
      lastWebhookAt: record?.lastWebhookAt ? new Date(record.lastWebhookAt.toString()).toISOString() : null,
      lastError: check.ok ? null : check.message,
      check,
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
    ...webhookInfo,
    status: 'CONNECTED',
    permissions: { contents: 'read' },
    lastApiCallAt: null,
    lastWebhookAt: null,
    lastError: null,
    check: null,
  };
}

