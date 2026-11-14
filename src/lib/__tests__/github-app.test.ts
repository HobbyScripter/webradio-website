/**
 * @jest-environment node
 */
import {
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  verify,
} from 'node:crypto';
import {
  GITHUB_APP_JWT_CLOCK_DRIFT_SECONDS,
  GITHUB_APP_JWT_MAX_LIFETIME_SECONDS,
  __resetGitHubAppTokenCacheForTests,
  generateGitHubAppJwt,
  getGitHubAppConfig,
  getInstallationAccessToken,
  verifyGitHubWebhookSignature,
} from '../github-app';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const CLIENT_ID = 'Iv23liExampleClientId';
const APP_ID = '123456';

type JwtParts = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
};

function decodeJwt(jwt: string): JwtParts {
  const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
  expect(encodedHeader).toBeTruthy();
  expect(encodedPayload).toBeTruthy();
  expect(encodedSignature).toBeTruthy();

  return {
    header: JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString('utf8')),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: Buffer.from(encodedSignature!, 'base64url'),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setGitHubEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('GitHub App Authentication & Webhook Verification', () => {
  describe('generateGitHubAppJwt', () => {
    it('uses the client ID (not the App ID) as the iss claim', () => {
      const jwt = generateGitHubAppJwt(CLIENT_ID, privateKey);

      const { payload } = decodeJwt(jwt);
      expect(payload.iss).toBe(CLIENT_ID);
      expect(payload.iss).not.toBe(APP_ID);
    });

    it('signs the JWT with RS256 using the App private key', () => {
      const jwt = generateGitHubAppJwt(CLIENT_ID, privateKey);
      const { header, signingInput, signature } = decodeJwt(jwt);

      expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
      expect(
        verify('RSA-SHA256', Buffer.from(signingInput), createPublicKey(publicKey), signature),
      ).toBe(true);
    });

    it('backdates iat by 60s and keeps the exp within the 10 minute limit', () => {
      const nowSeconds = 1_800_000_000;
      const jwt = generateGitHubAppJwt(CLIENT_ID, privateKey, { nowSeconds });

      const { payload } = decodeJwt(jwt);
      expect(payload.iat).toBe(nowSeconds - GITHUB_APP_JWT_CLOCK_DRIFT_SECONDS);
      expect(payload.iat).toBe(nowSeconds - 60);
      expect(payload.exp).toBeGreaterThan(nowSeconds);
      expect(Number(payload.exp) - nowSeconds).toBeLessThanOrEqual(10 * 60);
      expect(Number(payload.exp) - Number(payload.iat)).toBe(GITHUB_APP_JWT_MAX_LIFETIME_SECONDS);
    });

    it('rejects an empty issuer instead of silently using another value', () => {
      expect(() => generateGitHubAppJwt('   ', privateKey)).toThrow(/client ID/i);
    });

    it('rejects a private key that is not PEM encoded', () => {
      expect(() => generateGitHubAppJwt(CLIENT_ID, 'not-a-pem-key')).toThrow(/PEM/i);
    });
  });

  describe('getGitHubAppConfig', () => {
    const original = {
      GITHUB_APP_ID: process.env['GITHUB_APP_ID'],
      GITHUB_CLIENT_ID: process.env['GITHUB_CLIENT_ID'],
      GITHUB_INSTALLATION_ID: process.env['GITHUB_INSTALLATION_ID'],
    };

    afterEach(() => setGitHubEnv(original));

    it('keeps App ID and client ID as separate configuration values', () => {
      setGitHubEnv({
        GITHUB_APP_ID: APP_ID,
        GITHUB_CLIENT_ID: CLIENT_ID,
        GITHUB_INSTALLATION_ID: '9876543',
      });

      const config = getGitHubAppConfig();
      expect(config.appId).toBe(APP_ID);
      expect(config.clientId).toBe(CLIENT_ID);
      expect(config.installationId).toBe('9876543');
    });
  });

  describe('getInstallationAccessToken', () => {
    const ENV_KEYS = [
      'GITHUB_APP_ID',
      'GITHUB_CLIENT_ID',
      'GITHUB_INSTALLATION_ID',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_TOKEN',
    ] as const;
    const originalEnv = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
    const originalFetch = global.fetch;
    const fetchMock = jest.fn();

    beforeEach(() => {
      setGitHubEnv(Object.fromEntries(ENV_KEYS.map((key) => [key, undefined])));
      fetchMock.mockReset();
      global.fetch = fetchMock as unknown as typeof fetch;
      __resetGitHubAppTokenCacheForTests();
    });

    afterAll(() => {
      setGitHubEnv(originalEnv);
      global.fetch = originalFetch;
    });

    it('exchanges the client-ID JWT for an installation token using the installation ID', async () => {
      setGitHubEnv({
        GITHUB_APP_ID: APP_ID,
        GITHUB_CLIENT_ID: CLIENT_ID,
        GITHUB_INSTALLATION_ID: '9876543',
        GITHUB_APP_PRIVATE_KEY: privateKey,
      });
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          token: 'ghs_installation_token',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          permissions: { contents: 'read' },
        }),
      );

      const result = await getInstallationAccessToken();

      expect(result.source).toBe('github-app');
      expect(result.token).toBe('ghs_installation_token');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://api.github.com/app/installations/9876543/access_tokens',
      );
      expect(init.method).toBe('POST');

      const authorization = (init.headers as Record<string, string>)['Authorization'];
      expect(authorization).toMatch(/^Bearer .+/);
      const jwt = authorization.slice('Bearer '.length);
      const { payload } = decodeJwt(jwt);
      expect(payload.iss).toBe(CLIENT_ID);
      expect(payload.iss).not.toBe(APP_ID);
    });

    it('does not use the App ID as issuer when the client ID is missing', async () => {
      setGitHubEnv({
        GITHUB_APP_ID: APP_ID,
        GITHUB_INSTALLATION_ID: '9876543',
        GITHUB_APP_PRIVATE_KEY: privateKey,
        GITHUB_TOKEN: 'ghp_fallback_token',
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const result = await getInstallationAccessToken();

        expect(result.source).toBe('fallback-token');
        expect(result.token).toBe('ghp_fallback_token');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('GITHUB_CLIENT_ID'));
      } finally {
        warn.mockRestore();
      }
    });

    it('returns unauthenticated when neither App credentials nor a fallback token exist', async () => {
      const result = await getInstallationAccessToken();

      expect(result.source).toBe('unauthenticated');
      expect(result.token).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('verifyGitHubWebhookSignature', () => {
    const secret = 'super-secret-webhook-key-12345';
    const payload = JSON.stringify({ action: 'published', release: { id: 9876 } });

    it('accepts valid HMAC SHA-256 signature', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const isValid = verifyGitHubWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('rejects tampered payload', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const tamperedPayload = JSON.stringify({ action: 'deleted', release: { id: 9876 } });
      const isValid = verifyGitHubWebhookSignature(tamperedPayload, signature, secret);
      expect(isValid).toBe(false);
    });

    it('rejects wrong secret', () => {
      const hmac = createHmac('sha256', 'wrong-secret');
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const isValid = verifyGitHubWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(false);
    });

    it('rejects malformed signature headers', () => {
      expect(verifyGitHubWebhookSignature(payload, 'invalid-signature', secret)).toBe(false);
      expect(verifyGitHubWebhookSignature(payload, null, secret)).toBe(false);
      expect(verifyGitHubWebhookSignature(payload, '', secret)).toBe(false);
    });
  });
});
