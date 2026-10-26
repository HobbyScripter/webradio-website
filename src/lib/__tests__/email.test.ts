/**
 * @jest-environment node
 */
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  buildAuthLink,
  getAuthLinkOrigin,
  getOutboxDirectory,
  isEmailDeliveryConfigured,
  isEmailDeliveryPaused,
  sendTransactionalEmail,
} from '../email';

const mutableEnv = process.env as Record<string, string | undefined>;

const ORIGINAL_ENV = {
  NODE_ENV: process.env['NODE_ENV'],
  NEXTAUTH_URL: process.env['NEXTAUTH_URL'],
  EMAIL_SERVER_HOST: process.env['EMAIL_SERVER_HOST'],
  EMAIL_FROM: process.env['EMAIL_FROM'],
  RESEND_API_KEY: process.env['RESEND_API_KEY'],
  EMAIL_DELIVERY_ENABLED: process.env['EMAIL_DELIVERY_ENABLED'],
};

const fetchMock = jest.fn();

beforeEach(() => {
  // Deterministic provider selection: a developer .env must not leak a key.
  delete process.env['RESEND_API_KEY'];
  delete process.env['EMAIL_SERVER_HOST'];
  delete process.env['EMAIL_SERVER_PORT'];
  delete process.env['EMAIL_SERVER_USER'];
  delete process.env['EMAIL_SERVER_PASSWORD'];
  delete process.env['EMAIL_FROM'];
  // Delivery is paused by default in the application. These tests exercise the
  // provider paths, so they explicitly enable delivery; the paused default has
  // its own suite below.
  mutableEnv['EMAIL_DELIVERY_ENABLED'] = 'true';

  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  jest.restoreAllMocks();
});

describe('auth link origin', () => {
  it('uses NEXTAUTH_URL, never a request Host', () => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['NEXTAUTH_URL'] = 'https://webradio.example';
    expect(getAuthLinkOrigin()).toBe('https://webradio.example');
  });

  it('refuses plain HTTP for a non-loopback production origin', () => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['NEXTAUTH_URL'] = 'http://webradio.example';
    expect(getAuthLinkOrigin()).toBeNull();
  });

  it('allows HTTP only for an explicit loopback development origin', () => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['NEXTAUTH_URL'] = 'http://127.0.0.1:3100';
    expect(getAuthLinkOrigin()).toBe('http://127.0.0.1:3100');
  });

  it('builds a token link on the configured origin', () => {
    mutableEnv['NODE_ENV'] = 'development';
    mutableEnv['NEXTAUTH_URL'] = 'https://webradio.example';
    const token = 'a'.repeat(43);

    const link = buildAuthLink('/auth/reset-password', token);
    expect(link).toBe(`https://webradio.example/auth/reset-password?token=${token}`);
  });
});

describe('development outbox', () => {
  it('writes a message locally instead of logging the token', async () => {
    mutableEnv['NODE_ENV'] = 'test';

    const marker = `outbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: `marker=${marker}`,
    });

    expect(result).toEqual({ delivered: true, mode: 'outbox' });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const dir = getOutboxDirectory();
    const files = await readdir(dir);
    let found = '';
    for (const file of files) {
      const full = path.join(dir, file);
      const text = await readFile(full, 'utf8');
      if (text.includes(marker)) {
        found = full;
        break;
      }
    }

    expect(found).not.toBe('');
    if (found) {
      await rm(found, { force: true });
    }
  });
});

describe('Resend provider', () => {
  beforeEach(() => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['RESEND_API_KEY'] = 're_test_key';
    mutableEnv['EMAIL_FROM'] = 'WebRadio <noreply@webradio.example>';
  });

  it('delivers through the HTTPS API with the configured sender', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg_123' }),
    } as unknown as Response);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'WebRadio: E-Mail-Adresse bestätigen',
      text: 'Link: https://webradio.example/auth/verify-email?token=SECRET_TOKEN',
    });

    expect(result).toEqual({ delivered: true, mode: 'resend' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.from).toBe('WebRadio <noreply@webradio.example>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('WebRadio: E-Mail-Adresse bestätigen');
    expect(String(body.text)).toContain('SECRET_TOKEN');

    // The token is transported, never logged.
    expect(consoleError).not.toHaveBeenCalled();
    expect(isEmailDeliveryConfigured()).toBe(true);
  });

  it('classifies a provider rejection without leaking recipient or body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        name: 'validation_error',
        message: 'Invalid `to` field: user@example.com',
      }),
    } as unknown as Response);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'token=SECRET_TOKEN',
    });

    expect(result).toEqual({
      delivered: false,
      mode: 'resend',
      failure: 'provider_error',
      providerStatus: 422,
    });

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain('validation_error');
    expect(logged).toContain('422');
    expect(logged).not.toContain('user@example.com');
    expect(logged).not.toContain('SECRET_TOKEN');
    expect(logged).not.toContain('re_test_key');
  });

  it('reports a timeout instead of retrying (no duplicate mail)', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'body',
    });

    expect(result).toEqual({ delivered: false, mode: 'resend', failure: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('user@example.com');
  });

  it('fails with invalid_config when EMAIL_FROM is missing (no fallback)', async () => {
    delete process.env['EMAIL_FROM'];

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'body',
    });

    expect(result).toEqual({
      delivered: false,
      mode: 'resend',
      failure: 'invalid_config',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isEmailDeliveryConfigured()).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it('takes precedence over SMTP configuration', async () => {
    mutableEnv['EMAIL_SERVER_HOST'] = 'smtp.example.com';
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'body',
    });

    expect(result).toEqual({ delivered: true, mode: 'resend' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('production without a provider', () => {
  it('returns a controlled failure and writes nothing to the outbox', async () => {
    mutableEnv['NODE_ENV'] = 'production';

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await readdir(getOutboxDirectory()).catch(() => [] as string[]);

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'token=SECRET_TOKEN',
    });

    expect(result).toEqual({
      delivered: false,
      mode: 'unconfigured',
      failure: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    const after = await readdir(getOutboxDirectory()).catch(() => [] as string[]);
    expect(after.length).toBe(before.length);

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('SECRET_TOKEN');
    expect(logged).not.toContain('user@example.com');
  });
});

describe('paused delivery', () => {
  it('is paused unless EMAIL_DELIVERY_ENABLED is exactly "true"', async () => {
    delete process.env['EMAIL_DELIVERY_ENABLED'];
    expect(isEmailDeliveryPaused()).toBe(true);

    mutableEnv['EMAIL_DELIVERY_ENABLED'] = 'TRUE';
    expect(isEmailDeliveryPaused()).toBe(false);

    mutableEnv['EMAIL_DELIVERY_ENABLED'] = '1';
    expect(isEmailDeliveryPaused()).toBe(true);
  });

  it('makes no provider call and writes no outbox file while paused', async () => {
    delete process.env['EMAIL_DELIVERY_ENABLED'];
    mutableEnv['NODE_ENV'] = 'development';
    // Both a provider and the outbox would otherwise be reachable.
    mutableEnv['RESEND_API_KEY'] = 're_test_key';
    mutableEnv['EMAIL_FROM'] = 'WebRadio <noreply@webradio.example>';

    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const before = await readdir(getOutboxDirectory()).catch(() => [] as string[]);

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'token=SECRET_TOKEN',
    });

    expect(result).toEqual({
      delivered: false,
      mode: 'paused',
      failure: 'delivery_paused',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const after = await readdir(getOutboxDirectory()).catch(() => [] as string[]);
    expect(after.length).toBe(before.length);

    // The pause notice names the variable, never the recipient or the token.
    const logged = JSON.stringify(consoleWarn.mock.calls);
    expect(logged).not.toContain('SECRET_TOKEN');
    expect(logged).not.toContain('user@example.com');
  });
});
