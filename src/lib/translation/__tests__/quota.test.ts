/**
 * @jest-environment node
 *
 * B3 — provider quota (`GET /v2/usage`).
 *
 * The rules: one provider call per cache window, in-flight calls are shared,
 * a failure is reported as a state (never thrown, never a fake 0/0), and a
 * missing key or a provider without an account is explained instead of looking
 * like an outage.
 */
import { QUOTA_CACHE_TTL_MS, readProviderQuota, resetProviderQuotaCacheForTests } from '../quota';
import type { TranslationProvider, TranslationOutcome } from '../types';

function fakeProvider(usage: () => Promise<Awaited<ReturnType<NonNullable<TranslationProvider['usage']>>>>) {
  const usageMock = jest.fn(usage);
  const provider: TranslationProvider = {
    id: 'deepl',
    label: 'DeepL',
    supportedTargets: () => ['en'],
    supportsPair: () => true,
    translate: async (): Promise<TranslationOutcome> => ({
      ok: false,
      code: 'PROVIDER_ERROR',
      retryable: false,
    }),
    usage: usageMock,
    costMicros: () => 0,
  };
  return { provider, usageMock };
}

beforeEach(() => resetProviderQuotaCacheForTests());

describe('successful quota reading', () => {
  it('reports used and limit from the provider', async () => {
    const { provider } = fakeProvider(async () => ({
      ok: true,
      characterCount: 12_345,
      characterLimit: 500_000,
    }));

    const quota = await readProviderQuota({ env: {}, provider, now: 1_000 });

    expect(quota).toEqual({
      status: 'ok',
      used: 12_345,
      limit: 500_000,
      checkedAt: new Date(1_000).toISOString(),
    });
  });

  it('reports a missing limit as null instead of inventing one', async () => {
    const { provider } = fakeProvider(async () => ({
      ok: true,
      characterCount: 10,
      characterLimit: null,
    }));

    const quota = await readProviderQuota({ env: {}, provider });
    expect(quota.status).toBe('ok');
    if (quota.status === 'ok') expect(quota.limit).toBeNull();
  });
});

describe('caching', () => {
  it('calls the provider once for repeated page views inside the window', async () => {
    const { provider, usageMock } = fakeProvider(async () => ({
      ok: true,
      characterCount: 1,
      characterLimit: 100,
    }));

    await readProviderQuota({ env: {}, provider, now: 1_000 });
    await readProviderQuota({ env: {}, provider, now: 1_000 + QUOTA_CACHE_TTL_MS - 1 });

    expect(usageMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the cache window', async () => {
    const { provider, usageMock } = fakeProvider(async () => ({
      ok: true,
      characterCount: 1,
      characterLimit: 100,
    }));

    await readProviderQuota({ env: {}, provider, now: 1_000 });
    await readProviderQuota({ env: {}, provider, now: 1_000 + QUOTA_CACHE_TTL_MS + 1 });

    expect(usageMock).toHaveBeenCalledTimes(2);
  });

  it('shares a single in-flight call between concurrent readers', async () => {
    let resolve: (value: { ok: true; characterCount: number; characterLimit: number }) => void =
      () => {};
    const { provider, usageMock } = fakeProvider(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );

    const first = readProviderQuota({ env: {}, provider });
    const second = readProviderQuota({ env: {}, provider });
    resolve({ ok: true, characterCount: 5, characterLimit: 50 });

    const [a, b] = await Promise.all([first, second]);

    expect(usageMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('force bypasses the cache', async () => {
    const { provider, usageMock } = fakeProvider(async () => ({
      ok: true,
      characterCount: 1,
      characterLimit: 100,
    }));

    await readProviderQuota({ env: {}, provider, now: 1_000 });
    await readProviderQuota({ env: {}, provider, now: 1_001, force: true });

    expect(usageMock).toHaveBeenCalledTimes(2);
  });
});

describe('failure states', () => {
  it('maps a provider failure to an error with its code', async () => {
    const { provider } = fakeProvider(async () => ({ ok: false, code: 'QUOTA_EXCEEDED' }));

    const quota = await readProviderQuota({ env: {}, provider });

    expect(quota).toMatchObject({ status: 'error', code: 'QUOTA_EXCEEDED' });
  });

  it('turns an unexpected throw into PROVIDER_ERROR instead of crashing the page', async () => {
    const { provider } = fakeProvider(async () => {
      throw new Error('boom');
    });

    const quota = await readProviderQuota({ env: {}, provider });
    expect(quota).toMatchObject({ status: 'error', code: 'PROVIDER_ERROR' });
  });

  it('reports a missing API key as not_configured without calling anyone', async () => {
    const quota = await readProviderQuota({ env: { NODE_ENV: 'test' }, force: true });
    expect(quota).toEqual({ status: 'not_configured' });
  });

  it('reports the mock provider as having no quota', async () => {
    const quota = await readProviderQuota({
      env: { NODE_ENV: 'test', TRANSLATION_PROVIDER: 'mock' },
      force: true,
    });
    expect(quota.status).toBe('unsupported');
  });

  it('does not cache between distinct providers in one process', async () => {
    const { provider: ok } = fakeProvider(async () => ({
      ok: true,
      characterCount: 3,
      characterLimit: 10,
    }));
    const { provider: failing } = fakeProvider(async () => ({ ok: false, code: 'UNAUTHORIZED' }));

    expect((await readProviderQuota({ env: {}, provider: ok })).status).toBe('ok');
    expect((await readProviderQuota({ env: {}, provider: failing, force: true })).status).toBe(
      'error',
    );
  });
});
