/**
 * Provider registry and central configuration.
 *
 * One place decides which provider a batch uses, whether it is usable at all,
 * what it costs and how large a batch may be. Nothing else in the application
 * reads `DEEPL_API_KEY` — this module is the only reader, and it never returns
 * the key.
 *
 * Environment variables
 * ---------------------
 *   TRANSLATION_PROVIDER              `deepl` (default) or `mock`
 *   DEEPL_API_KEY                     required for real DeepL calls
 *   DEEPL_API_URL                     optional override (self-hosted proxy)
 *   DEEPL_PRICE_PER_MILLION_EUR       price for the cost estimate, default 20
 *   TRANSLATION_BATCH_LIMIT           rows per batch, default 20
 *   TRANSLATION_MAX_CHARS_PER_FIELD   per-field character cap, default 10000
 *   TRANSLATION_ALLOW_MOCK            `true` to enable the mock provider in production
 *   TRANSLATION_QUOTA_WARN_PERCENT    warn threshold for the monthly quota, default 80
 */
import type { Locale } from '@/i18n/config';
import { DeepLProvider, defaultDeepLApiUrl, getCachedDeepLTargets } from './providers/deepl';
import { MockProvider } from './providers/mock';
import type { ProviderId, ProviderMeta, TranslationProvider } from './types';

export const TRANSLATION_ENV = {
  provider: 'TRANSLATION_PROVIDER',
  deeplKey: 'DEEPL_API_KEY',
  deeplUrl: 'DEEPL_API_URL',
  pricePerMillionEur: 'DEEPL_PRICE_PER_MILLION_EUR',
  batchLimit: 'TRANSLATION_BATCH_LIMIT',
  maxCharsPerField: 'TRANSLATION_MAX_CHARS_PER_FIELD',
  allowMock: 'TRANSLATION_ALLOW_MOCK',
  quotaWarnPercent: 'TRANSLATION_QUOTA_WARN_PERCENT',
} as const;

export type TranslationEnv = Record<string, string | undefined>;

export type TranslationConfig = {
  provider: ProviderId;
  deeplConfigured: boolean;
  deeplApiUrl: string | null;
  /** Millionths of a euro per character, used for the cost estimate. */
  pricePerMillionMicros: number;
  batchLimit: number;
  maxCharsPerField: number;
  quotaWarnPercent: number;
  mockAllowed: boolean;
};

function readString(env: TranslationEnv, name: string): string | null {
  const raw = env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function readInt(env: TranslationEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = readString(env, name);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export function readTranslationConfig(env: TranslationEnv = process.env): TranslationConfig {
  const providerName = readString(env, TRANSLATION_ENV.provider)?.toLowerCase() ?? 'deepl';
  const provider: ProviderId = providerName === 'mock' ? 'mock' : 'deepl';
  const deeplKey = readString(env, TRANSLATION_ENV.deeplKey);
  const pricePerMillionEur = readInt(env, TRANSLATION_ENV.pricePerMillionEur, 20, 0, 1_000);

  return {
    provider,
    deeplConfigured: deeplKey !== null,
    deeplApiUrl: readString(env, TRANSLATION_ENV.deeplUrl),
    // €20 per million characters = 20,000,000 micros per million.
    pricePerMillionMicros: pricePerMillionEur * 1_000_000,
    batchLimit: readInt(env, TRANSLATION_ENV.batchLimit, 20, 1, 200),
    maxCharsPerField: readInt(env, TRANSLATION_ENV.maxCharsPerField, 10_000, 100, 30_000),
    quotaWarnPercent: readInt(env, TRANSLATION_ENV.quotaWarnPercent, 80, 1, 100),
    mockAllowed:
      env.NODE_ENV !== 'production' || readString(env, TRANSLATION_ENV.allowMock) === 'true',
  };
}

/**
 * Instantiate a provider for a batch.
 *
 * Returns `null` when the requested provider has no usable configuration —
 * callers then report `NOT_CONFIGURED` and send nothing. A missing key is a
 * configuration state, not an error to crash on.
 */
export function createTranslationProvider(
  config: TranslationConfig,
  env: TranslationEnv = process.env,
  options: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): TranslationProvider | null {
  if (config.provider === 'mock') {
    return config.mockAllowed ? new MockProvider() : null;
  }

  const apiKey = readString(env, TRANSLATION_ENV.deeplKey);
  if (apiKey === null) {
    return null;
  }

  return new DeepLProvider({
    apiKey,
    apiUrl: config.deeplApiUrl ?? defaultDeepLApiUrl(apiKey),
    pricePerMillionMicros: config.pricePerMillionMicros,
    maxTextCharacters: config.maxCharsPerField,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
  });
}

/** Provider metadata for the admin UI. Contains no secret. */
export function listProviderMeta(env: TranslationEnv = process.env): ProviderMeta[] {
  const config = readTranslationConfig(env);
  return [
    {
      id: 'deepl',
      label: 'DeepL',
      requiresKey: true,
      configured: config.deeplConfigured,
      docsUrl: 'https://developers.deepl.com/docs',
    },
    {
      id: 'mock',
      label: 'Mock (Test)',
      requiresKey: false,
      configured: config.mockAllowed,
      docsUrl: '/docs/TRANSLATION_ENGINE.md',
    },
  ];
}

/** Target locales the configured provider can translate into. */
export function supportedTargetLocales(env: TranslationEnv = process.env): readonly Locale[] {
  const config = readTranslationConfig(env);
  if (config.provider === 'mock') {
    return config.mockAllowed ? (['de', 'en', 'nl', 'fr', 'es', 'it', 'pl'] as Locale[]) : [];
  }
  return getCachedDeepLTargets();
}

/** Human-readable quota state for the dashboard, without touching the network. */
export function quotaState(
  used: number | null,
  limit: number | null,
  warnPercent: number,
): 'unknown' | 'ok' | 'warning' | 'exhausted' {
  if (used === null || limit === null || limit <= 0) return 'unknown';
  const percent = (used / limit) * 100;
  if (percent >= 100) return 'exhausted';
  if (percent >= warnPercent) return 'warning';
  return 'ok';
}
