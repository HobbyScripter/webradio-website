/**
 * @jest-environment node
 *
 * Provider-level behaviour: term protection, privacy screening, language
 * mapping, DeepL transport (retries, error taxonomy, schema validation) and
 * central configuration. No test performs a real network request.
 */
import { DeepLProvider, defaultDeepLApiUrl, resetDeepLLanguageCacheForTests } from '../providers/deepl';
import { MockProvider } from '../providers/mock';
import { protectTerms, restoreTerms } from '../protect';
import { inspectForPrivateData } from '../privacy';
import { fromDeepLCode, intersectTargetLanguages, toDeepLTarget } from '../languages';
import {
  createTranslationProvider,
  listProviderMeta,
  quotaState,
  readTranslationConfig,
} from '../registry';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function translationResponse(text: string, detected = 'DE'): Response {
  return jsonResponse({ translations: [{ detected_source_language: detected, text }] });
}

describe('term protection', () => {
  it('masks product names, versions, URLs, code and placeholders', () => {
    const source =
      'WebRadio 1.4.0 ist da. Details unter https://example.com/releases und in `npm run dev`.';
    const { masked, terms } = protectTerms(source);

    expect(masked).not.toContain('WebRadio');
    expect(masked).not.toContain('1.4.0');
    expect(masked).not.toContain('https://example.com/releases');
    expect(masked).not.toContain('npm run dev');
    expect(terms.length).toBeGreaterThanOrEqual(4);
    expect(restoreTerms(masked, terms)).toBe(source);
  });

  it('keeps {placeholders} intact', () => {
    const { masked, terms } = protectTerms('Hallo {name}, willkommen bei WebRadio.');
    expect(masked).toContain('<ph id=');
    expect(restoreTerms(masked, terms)).toBe('Hallo {name}, willkommen bei WebRadio.');
  });

  it('uses plain tokens when the text contains XML metacharacters', () => {
    const { masked, mode } = protectTerms('Lies <b>mehr</b> zu WebRadio 2.0.');
    expect(mode).toBe('plain');
    expect(masked).toContain('⟦');
  });

  it('returns null when a placeholder was lost', () => {
    const { terms } = protectTerms('WebRadio ist schnell.');
    expect(restoreTerms('Web-Schnell ist schnell.', terms)).toBeNull();
  });
});

describe('privacy screening', () => {
  it.each([
    ['schreib an support@example.com', 'email'],
    ['password = geheim123', 'password'],
    ['token: abcdef123456', 'password'],
    ['sk-abcdefghijklmnopqrstuvwx', 'api_key'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'api_key'],
    ['DE89370400440532013000', 'iban'],
    ['Bearer abcdefghijklmnop', 'bearer_token'],
  ])('blocks %s', (text, finding) => {
    const result = inspectForPrivateData(text);
    expect(result.safe).toBe(false);
    expect(result.findings).toContain(finding);
  });

  it('does not block ordinary marketing copy', () => {
    const text =
      'WebRadio 1.4.0 erscheint am 12.03.2026 mit neuen Funktionen für Windows und Linux.';
    expect(inspectForPrivateData(text)).toEqual({ safe: true, findings: [] });
  });
});

describe('language mapping', () => {
  it('maps our locales to DeepL codes', () => {
    expect(toDeepLTarget('de')).toBe('DE');
    expect(toDeepLTarget('en')).toBe('EN-GB');
    expect(toDeepLTarget('pl')).toBe('PL');
  });

  it('maps provider codes back, including regional variants', () => {
    expect(fromDeepLCode('EN-US')).toBe('en');
    expect(fromDeepLCode('DE')).toBe('de');
    expect(fromDeepLCode('PT')).toBeNull();
  });

  it('intersects only supported locales', () => {
    expect(intersectTargetLanguages(['DE', 'EN-US', 'FR', 'PT'])).toEqual(['de', 'en', 'fr']);
  });
});

describe('DeepL transport', () => {
  beforeEach(() => resetDeepLLanguageCacheForTests());

  function provider(fetchImpl: typeof fetch, options: Record<string, unknown> = {}) {
    return new DeepLProvider({
      apiKey: 'test-key',
      fetchImpl,
      sleep: async () => undefined,
      ...options,
    });
  }

  it('sends a JSON request with header auth and restores terms', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return translationResponse('⟪PL⟫ <ph id="1"/>');
    }) as unknown as typeof fetch;

    const result = await provider(fetchImpl).translate({
      text: 'WebRadio ist schnell.',
      sourceLocale: 'de',
      targetLocale: 'pl',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('WebRadio');
      expect(result.characters).toBeGreaterThan(0);
      expect(result.detectedSource).toBe('de');
    }

    const [call] = calls;
    expect(call.url).toBe('https://api.deepl.com/v2/translate');
    expect((call.init.headers as Record<string, string>).Authorization).toBe(
      'DeepL-Auth-Key test-key',
    );
    const body = JSON.parse(String(call.init.body));
    expect(body.target_lang).toBe('PL');
    expect(body.source_lang).toBe('DE');
    expect(body.preserve_formatting).toBe(true);
    expect(body.tag_handling).toBe('xml');
  });

  it('retries a rate limit and honours Retry-After', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const fetchImpl = (async () => {
      attempts += 1;
      if (attempts < 3) return jsonResponse({}, 429, { 'retry-after': '1' });
      return translationResponse('Hallo');
    }) as unknown as typeof fetch;

    const result = await provider(fetchImpl, {
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    }).translate({ text: 'Hallo Welt', sourceLocale: 'de', targetLocale: 'en' });

    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
    expect(delays).toEqual([1_000, 1_000]);
  });

  it('does not retry an exhausted quota', async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      return jsonResponse({}, 456);
    }) as unknown as typeof fetch;

    const result = await provider(fetchImpl).translate({
      text: 'Hallo',
      sourceLocale: 'de',
      targetLocale: 'en',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('QUOTA_EXCEEDED');
      expect(result.retryable).toBe(false);
    }
    expect(attempts).toBe(1);
  });

  it('classifies auth failures', async () => {
    const fetchImpl = (async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    const result = await provider(fetchImpl).translate({
      text: 'Hallo',
      sourceLocale: 'de',
      targetLocale: 'fr',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('rejects a response that does not match the schema', async () => {
    const fetchImpl = (async () => jsonResponse({ unexpected: true })) as unknown as typeof fetch;
    const result = await provider(fetchImpl).translate({
      text: 'Hallo',
      sourceLocale: 'de',
      targetLocale: 'it',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_RESPONSE');
  });

  it('retries network errors and then reports them', async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const result = await provider(fetchImpl, { maxRetries: 1 }).translate({
      text: 'Hallo',
      sourceLocale: 'de',
      targetLocale: 'nl',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NETWORK');
      expect(result.retryable).toBe(true);
    }
    expect(attempts).toBe(2);
  });

  it('rejects a translation that lost a protected term', async () => {
    const fetchImpl = (async () => translationResponse('verloren')) as unknown as typeof fetch;
    const result = await provider(fetchImpl).translate({
      text: 'WebRadio ist schnell.',
      sourceLocale: 'de',
      targetLocale: 'en',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PLACEHOLDER_LOST');
  });

  it('refuses an unsupported target without calling the API', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return translationResponse('x');
    }) as unknown as typeof fetch;

    const result = await provider(fetchImpl).translate({
      text: 'Hallo',
      sourceLocale: 'de',
      targetLocale: 'pt' as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNSUPPORTED_PAIR');
    expect(called).toBe(false);
  });

  it('refuses empty text', async () => {
    const result = await provider((async () => translationResponse('x')) as unknown as typeof fetch)
      .translate({ text: '   ', sourceLocale: 'de', targetLocale: 'en' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOTHING_TO_TRANSLATE');
  });

  it('reads the monthly quota', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ character_count: 1_000, character_limit: 500_000 })) as unknown as typeof fetch;
    const usage = await provider(fetchImpl).usage?.();
    expect(usage).toEqual({ ok: true, characterCount: 1_000, characterLimit: 500_000 });
  });

  it('caches the provider language list', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse([
        { language: 'DE' },
        { language: 'EN-GB' },
        { language: 'PL' },
      ]);
    }) as unknown as typeof fetch;

    const instance = provider(fetchImpl);
    const first = await instance.syncLanguages(true);
    const second = await instance.syncLanguages();

    expect(first).toEqual(['de', 'en', 'pl']);
    expect(second).toEqual(['de', 'en', 'pl']);
    expect(calls).toBe(1);
  });

  it('derives the endpoint from the key and computes cost', () => {
    expect(defaultDeepLApiUrl('abc:fx')).toBe('https://api-free.deepl.com');
    expect(defaultDeepLApiUrl('abc')).toBe('https://api.deepl.com');
    const instance = new DeepLProvider({ apiKey: 'x', pricePerMillionMicros: 20_000_000 });
    expect(instance.costMicros(1_000_000)).toBe(20_000_000);
    expect(instance.costMicros(1_000)).toBe(20_000);
  });
});

describe('mock provider', () => {
  it('produces deterministic, marked output', async () => {
    const mock = new MockProvider();
    const result = await mock.translate({ text: 'WebRadio ist schnell.', sourceLocale: 'de', targetLocale: 'en' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe('⟪en⟫ WebRadio ist schnell.');
    expect(mock.calls).toBe(1);
  });

  it('can inject failures', async () => {
    const mock = new MockProvider({ failWith: 'RATE_LIMITED', failTimes: 1 });
    const failed = await mock.translate({ text: 'Hallo', sourceLocale: 'de', targetLocale: 'en' });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe('RATE_LIMITED');
    const ok = await mock.translate({ text: 'Hallo', sourceLocale: 'de', targetLocale: 'en' });
    expect(ok.ok).toBe(true);
  });
});

describe('provider registry', () => {
  it('reports a missing key instead of creating a provider', () => {
    const env = { TRANSLATION_PROVIDER: 'deepl' } as Record<string, string | undefined>;
    const config = readTranslationConfig(env);
    expect(config.deeplConfigured).toBe(false);
    expect(createTranslationProvider(config, env)).toBeNull();
  });

  it('creates a DeepL provider when a key is present', () => {
    const env = { DEEPL_API_KEY: 'secret-key' } as Record<string, string | undefined>;
    const provider = createTranslationProvider(readTranslationConfig(env), env);
    expect(provider?.id).toBe('deepl');
  });

  it('allows the mock provider outside production only', () => {
    const devEnv = { TRANSLATION_PROVIDER: 'mock', NODE_ENV: 'development' } as Record<
      string,
      string | undefined
    >;
    expect(createTranslationProvider(readTranslationConfig(devEnv), devEnv)?.id).toBe('mock');

    const prodEnv = { TRANSLATION_PROVIDER: 'mock', NODE_ENV: 'production' } as Record<
      string,
      string | undefined
    >;
    expect(createTranslationProvider(readTranslationConfig(prodEnv), prodEnv)).toBeNull();

    const allowedEnv = {
      TRANSLATION_PROVIDER: 'mock',
      NODE_ENV: 'production',
      TRANSLATION_ALLOW_MOCK: 'true',
    } as Record<string, string | undefined>;
    expect(createTranslationProvider(readTranslationConfig(allowedEnv), allowedEnv)?.id).toBe('mock');
  });

  it('never exposes the key in provider metadata', () => {
    const env = { DEEPL_API_KEY: 'super-secret-value' } as Record<string, string | undefined>;
    const serialized = JSON.stringify(listProviderMeta(env));
    expect(serialized).not.toContain('super-secret-value');
    expect(listProviderMeta(env).find((entry) => entry.id === 'deepl')?.configured).toBe(true);
  });

  it('classifies quota state', () => {
    expect(quotaState(null, null, 80)).toBe('unknown');
    expect(quotaState(10, 100, 80)).toBe('ok');
    expect(quotaState(85, 100, 80)).toBe('warning');
    expect(quotaState(100, 100, 80)).toBe('exhausted');
  });

  it('respects the batch limit and character caps', () => {
    const env = {
      TRANSLATION_BATCH_LIMIT: '9999',
      TRANSLATION_MAX_CHARS_PER_FIELD: '5',
    } as Record<string, string | undefined>;
    const config = readTranslationConfig(env);
    expect(config.batchLimit).toBe(200);
    expect(config.maxCharsPerField).toBe(100);
  });
});
