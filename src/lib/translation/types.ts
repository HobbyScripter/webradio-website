/**
 * Shared vocabulary of the translation engine.
 *
 * Providers are interchangeable behind `TranslationProvider`. The engine only
 * ever sees these types, so adding a provider (DeepL, a self-hosted engine, a
 * human vendor) never touches routing, storage or the admin UI.
 */
import type { Locale } from '@/i18n/config';

/** Stable provider identifiers. `deepl` is the primary machine provider. */
export const PROVIDER_IDS = ['deepl', 'mock'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * Error taxonomy.
 *
 * Codes are stable, secret-free and safe to persist, log and show in the admin
 * UI. A provider failure never contains the translated text, the API key or the
 * raw upstream response body.
 */
export const TRANSLATION_ERROR_CODES = [
  /** No API key (or no provider) configured — nothing is sent anywhere. */
  'NOT_CONFIGURED',
  /** The provider does not offer this source/target language pair. */
  'UNSUPPORTED_PAIR',
  /** 429 — too many requests; retryable after `retryAfterMs`. */
  'RATE_LIMITED',
  /** 456 / provider quota exhausted — not retryable until the quota resets. */
  'QUOTA_EXCEEDED',
  /** 401/403 — invalid or revoked credentials. */
  'UNAUTHORIZED',
  /** 2xx but the payload did not match the expected schema. */
  'INVALID_RESPONSE',
  /** Network error, DNS failure, connection reset. */
  'NETWORK',
  /** Request exceeded the configured timeout. */
  'TIMEOUT',
  /** Any other non-2xx response. */
  'PROVIDER_ERROR',
  /** Text exceeds the per-request character limit. */
  'TEXT_TOO_LONG',
  /** Nothing left to translate (empty or whitespace-only source). */
  'NOTHING_TO_TRANSLATE',
  /** The privacy screen refused the text (credentials, personal data). */
  'PRIVACY_BLOCKED',
  /** A term-protection placeholder was lost in the response. */
  'PLACEHOLDER_LOST',
  /**
   * The database rejected the write (constraint, connection). Recorded on the
   * job so a row can never fail silently after the provider was already paid.
   */
  'STORAGE_ERROR',
] as const;
export type TranslationErrorCode = (typeof TRANSLATION_ERROR_CODES)[number];

export type TranslationFailure = {
  ok: false;
  code: TranslationErrorCode;
  /** Whether a later retry of the same input can reasonably succeed. */
  retryable: boolean;
  /** Suggested delay before retrying, when the provider tells us. */
  retryAfterMs?: number;
  /** Upstream HTTP status, when there was one. */
  status?: number;
};

export type TranslationSuccess = {
  ok: true;
  /** Translated text with every protected term restored. */
  text: string;
  /** Source language reported by the provider (BCP-47 primary subtag). */
  detectedSource?: string;
  /** Characters billed for this call; the engine records it as usage. */
  characters: number;
};

export type TranslationOutcome = TranslationSuccess | TranslationFailure;

export type TranslateInput = {
  text: string;
  sourceLocale: Locale;
  targetLocale: Locale;
  /** Optional context (entity type) that providers may use as a hint. */
  context?: string;
  signal?: AbortSignal;
};

export type ProviderUsageSnapshot = {
  ok: true;
  characterCount: number;
  characterLimit: number | null;
} | {
  ok: false;
  code: TranslationErrorCode;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  /** True when the provider needs a server-side credential to work at all. */
  requiresKey: boolean;
  /** False when the credential is missing; the UI shows an explanation. */
  configured: boolean;
  docsUrl: string;
};

/**
 * The provider contract.
 *
 * `translate` never throws for an expected failure: it returns a
 * `TranslationFailure` so a batch can continue with the next row. Only a
 * programming error (e.g. a bug in the engine) may throw.
 */
export interface TranslationProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Target locales this provider can translate into. */
  supportedTargets(): readonly Locale[];
  supportsPair(sourceLocale: Locale, targetLocale: Locale): boolean;
  translate(input: TranslateInput): Promise<TranslationOutcome>;
  /** Remaining monthly quota, when the provider exposes it. */
  usage?(): Promise<ProviderUsageSnapshot>;
  /** Price used for the cost estimate, in millionths of the billing currency. */
  costMicros(characters: number): number;
}
