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
  checkGitHubAppConnection,
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

  describe('checkGitHubAppConnection', () => {
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
    const installationToken = 'ghs_installation_token_should_not_leak';

    function configureApp(overrides: Record<string, string> = {}) {
      setGitHubEnv({
        GITHUB_APP_ID: APP_ID,
        GITHUB_CLIENT_ID: CLIENT_ID,
        GITHUB_INSTALLATION_ID: '9876543',
        GITHUB_APP_PRIVATE_KEY: privateKey,
        ...overrides,
      });
    }

    beforeEach(() => {
      setGitHubEnv(Object.fromEntries(ENV_KEYS.map((key) => [key, undefined])));
      fetchMock.mockReset();
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterAll(() => {
      setGitHubEnv(originalEnv);
      global.fetch = originalFetch;
    });

    it('returns OK after JWT, installation token and repository read succeed', async () => {
      configureApp();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            token: installationToken,
            expires_at: '2030-01-01T00:00:00Z',
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ full_name: 'YourEliteSystems/WebRadio' }));

      const result = await checkGitHubAppConnection();

      expect(result.ok).toBe(true);
      expect(result.code).toBe('OK');
      expect(result.stage).toBe('repository');
      expect(result.httpStatus).toBe(200);
      expect(result.tokenExpiresAt).toBe('2030-01-01T00:00:00Z');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(tokenUrl).toBe(
        'https://api.github.com/app/installations/9876543/access_tokens',
      );
      expect(tokenInit.method).toBe('POST');
      const authorization = (tokenInit.headers as Record<string, string>)['Authorization'];
      const jwt = authorization.slice('Bearer '.length);
      expect(decodeJwt(jwt).payload.iss).toBe(CLIENT_ID);

      const [repositoryUrl, repositoryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(repositoryUrl).toBe('https://api.github.com/repos/YourEliteSystems/WebRadio');
      expect((repositoryInit.headers as Record<string, string>)['Authorization']).toBe(
        `Bearer ${installationToken}`,
      );

      // The result is safe to render: no token, no key material, no JWT.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(installationToken);
      expect(serialized).not.toContain('eyJ');
      expect(serialized).not.toContain('PRIVATE KEY');
    });

    it('classifies a rejected JWT as INVALID_JWT (HTTP 401)', async () => {
      configureApp();
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401));

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({
        ok: false,
        code: 'INVALID_JWT',
        stage: 'token',
        httpStatus: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('classifies an unknown installation as INSTALLATION_NOT_FOUND (HTTP 404)', async () => {
      configureApp();
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({
        ok: false,
        code: 'INSTALLATION_NOT_FOUND',
        stage: 'token',
        httpStatus: 404,
      });
    });

    it('classifies a missing repository permission as FORBIDDEN', async () => {
      configureApp();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ token: installationToken, expires_at: '2030-01-01T00:00:00Z' }),
        )
        .mockResolvedValueOnce(jsonResponse({ message: 'Resource not accessible' }, 403));

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
        stage: 'repository',
        httpStatus: 403,
      });
    });

    it('classifies an unreachable API as API_ERROR without leaking a token', async () => {
      configureApp();
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({
        ok: false,
        code: 'API_ERROR',
        stage: 'token',
        httpStatus: null,
      });
      expect(JSON.stringify(result)).not.toContain(installationToken);
    });

    it('reports missing variables by name without calling GitHub', async () => {
      setGitHubEnv({ GITHUB_INSTALLATION_ID: '9876543' });

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({ ok: false, code: 'NOT_CONFIGURED', stage: 'config' });
      expect(result.message).toContain('GITHUB_CLIENT_ID');
      expect(result.message).toContain('GITHUB_APP_PRIVATE_KEY');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric installation ID before any request', async () => {
      configureApp({ GITHUB_INSTALLATION_ID: 'not-a-number' });

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({
        ok: false,
        code: 'INSTALLATION_NOT_FOUND',
        stage: 'config',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a key that is not PEM before any request', async () => {
      configureApp({ GITHUB_APP_PRIVATE_KEY: 'not-a-pem-key' });

      const result = await checkGitHubAppConnection();

      expect(result).toMatchObject({
        ok: false,
        code: 'INVALID_PRIVATE_KEY',
        stage: 'config',
      });
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
