/**
 * DeepL provider.
 *
 * Server-only. The API key is read from the environment by `registry.ts` and
 * never appears in logs, error objects, the admin UI or a response body. Every
 * request is JSON, validated with Zod on the way back, and never retried when
 * the failure is permanent (bad key, exhausted quota, unsupported pair).
 *
 * Reference: https://developers.deepl.com/api-reference/translate
 */
import { z } from 'zod';
import type { Locale } from '@/i18n/config';
import {
  DEEPL_SUPPORTED_TARGETS,
  fromDeepLCode,
  intersectTargetLanguages,
  toDeepLSource,
  toDeepLTarget,
} from '../languages';
import { billableCharacters, protectTerms, restoreTerms } from '../protect';
import type {
  ProviderUsageSnapshot,
  TranslateInput,
  TranslationFailure,
  TranslationOutcome,
  TranslationProvider,
} from '../types';

/** DeepL's documented per-text limit; a single field never exceeds this. */
export const DEEPL_MAX_TEXT_CHARACTERS = 30_000;

const translateResponseSchema = z.object({
  translations: z
    .array(
      z.object({
        detected_source_language: z.string().min(1).max(16),
        text: z.string(),
      }),
    )
    .min(1),
});

const usageResponseSchema = z.object({
  character_count: z.number().int().nonnegative(),
  character_limit: z.number().int().nonnegative(),
});

const languagesResponseSchema = z.array(
  z.object({
    language: z.string().min(1).max(16),
    name: z.string().optional(),
    supports_formality: z.boolean().optional(),
  }),
);

export type DeepLOptions = {
  apiKey: string;
  /** Defaults to the free or pro endpoint, derived from the key suffix. */
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Extra attempts after the first one; only for retryable failures. */
  maxRetries?: number;
  /** Billing price per one million characters, in millionths of the currency. */
  pricePerMillionMicros?: number;
  sleep?: (ms: number) => Promise<void>;
  maxTextCharacters?: number;
};

/** Free keys end in `:fx` and must use the free host. */
export function defaultDeepLApiUrl(apiKey: string): string {
  return apiKey.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function failure(
  code: TranslationFailure['code'],
  options: { retryable?: boolean; retryAfterMs?: number; status?: number } = {},
): TranslationFailure {
  return {
    ok: false,
    code,
    retryable: options.retryable ?? false,
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
    ...(options.status !== undefined ? { status: options.status } : {}),
  };
}

/** Map an HTTP status to the error taxonomy. Never inspects the body. */
function statusToFailure(status: number, retryAfterMs?: number): TranslationFailure {
  if (status === 401 || status === 403) return failure('UNAUTHORIZED', { status });
  if (status === 429) {
    return failure('RATE_LIMITED', { retryable: true, retryAfterMs: retryAfterMs ?? 1_000, status });
  }
  if (status === 456) return failure('QUOTA_EXCEEDED', { status });
  if (status === 400) return failure('UNSUPPORTED_PAIR', { status });
  if (status === 413) return failure('TEXT_TOO_LONG', { status });
  if (status >= 500) return failure('PROVIDER_ERROR', { retryable: true, status });
  return failure('PROVIDER_ERROR', { status });
}

/** `Retry-After` in seconds or as an HTTP date. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  return undefined;
}

/**
 * Process-wide language cache.
 *
 * DeepL's supported-language list changes rarely, so it is fetched at most once
 * per day (by the cron worker, never by a page render). Until then the static
 * map is used, which cannot be wrong for the seven languages we ship.
 */
let cachedTargets: Locale[] = [...DEEPL_SUPPORTED_TARGETS];
let cachedTargetsAt = 0;
const LANGUAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

export function getCachedDeepLTargets(): readonly Locale[] {
  return cachedTargets;
}

export function resetDeepLLanguageCacheForTests(): void {
  cachedTargets = [...DEEPL_SUPPORTED_TARGETS];
  cachedTargetsAt = 0;
}

export class DeepLProvider implements TranslationProvider {
  readonly id = 'deepl' as const;
  readonly label = 'DeepL';

  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly pricePerMillionMicros: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxTextCharacters: number;

  constructor(options: DeepLOptions) {
    this.apiKey = options.apiKey.trim();
    this.apiUrl = (options.apiUrl?.trim() || defaultDeepLApiUrl(this.apiKey)).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 2, 5));
    this.pricePerMillionMicros = options.pricePerMillionMicros ?? 20_000_000;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxTextCharacters = options.maxTextCharacters ?? DEEPL_MAX_TEXT_CHARACTERS;
  }

  supportedTargets(): readonly Locale[] {
    return cachedTargets;
  }

  supportsPair(_sourceLocale: Locale, targetLocale: Locale): boolean {
    return cachedTargets.includes(targetLocale);
  }

  costMicros(characters: number): number {
    if (characters <= 0) return 0;
    return Math.round((characters / 1_000_000) * this.pricePerMillionMicros);
  }

  /** Refresh the provider's target-language list; cached for 24 hours. */
  async syncLanguages(force = false): Promise<readonly Locale[]> {
    if (!force && Date.now() - cachedTargetsAt < LANGUAGE_CACHE_TTL_MS) {
      return cachedTargets;
    }

    const response = await this.request('/v2/languages?type=target', { method: 'GET' });
    if (!response.ok) {
      return cachedTargets;
    }

    const parsed = languagesResponseSchema.safeParse(response.json);
    if (!parsed.success) {
      return cachedTargets;
    }

    const supported = intersectTargetLanguages(parsed.data.map((entry) => entry.language));
    if (supported.length > 0) {
      cachedTargets = supported;
      cachedTargetsAt = Date.now();
    }
    return cachedTargets;
  }

  async usage(): Promise<ProviderUsageSnapshot> {
    const response = await this.request('/v2/usage', { method: 'GET' });
    if (!response.ok) {
      return { ok: false, code: response.failure.code };
    }

    const parsed = usageResponseSchema.safeParse(response.json);
    if (!parsed.success) {
      return { ok: false, code: 'INVALID_RESPONSE' };
    }

    return {
      ok: true,
      characterCount: parsed.data.character_count,
      characterLimit: parsed.data.character_limit,
    };
  }

  async translate(input: TranslateInput): Promise<TranslationOutcome> {
    const targetCode = toDeepLTarget(input.targetLocale);
    const sourceCode = toDeepLSource(input.sourceLocale);
    if (!targetCode || !sourceCode || !this.supportsPair(input.sourceLocale, input.targetLocale)) {
      return failure('UNSUPPORTED_PAIR');
    }

    if (input.text.trim().length === 0) {
      return failure('NOTHING_TO_TRANSLATE');
    }

    const { masked, terms, mode } = protectTerms(input.text);
    if (billableCharacters(masked) > this.maxTextCharacters) {
      return failure('TEXT_TOO_LONG');
    }

    const body = {
      text: [masked],
      source_lang: sourceCode,
      target_lang: targetCode,
      preserve_formatting: true,
      ...(mode === 'xml' ? { tag_handling: 'xml' } : {}),
    };

    const response = await this.request('/v2/translate', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!response.ok) {
      return response.failure;
    }

    const parsed = translateResponseSchema.safeParse(response.json);
    if (!parsed.success) {
      console.warn(
        JSON.stringify({ event: 'translation.deepl.invalid_response', provider: 'deepl' }),
      );
      return failure('INVALID_RESPONSE');
    }

    const translation = parsed.data.translations[0];
    const restored = restoreTerms(translation.text, terms);
    if (restored === null) {
      console.warn(
        JSON.stringify({ event: 'translation.deepl.placeholder_lost', provider: 'deepl' }),
      );
      return failure('PLACEHOLDER_LOST');
    }

    return {
      ok: true,
      text: restored,
      detectedSource: fromDeepLCode(translation.detected_source_language) ?? undefined,
      characters: billableCharacters(masked),
    };
  }

  /**
   * One HTTP call with timeout and retry.
   *
   * The upstream body is parsed but never logged or returned on failure: it can
   * echo request text. Only status and a stable error code leave this method.
   */
  private async request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string; signal?: AbortSignal },
  ): Promise<
    | { ok: true; json: unknown }
    | { ok: false; failure: TranslationFailure }
  > {
    let attempt = 0;
    let lastFailure: TranslationFailure = failure('PROVIDER_ERROR');

    while (attempt <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const onAbort = () => controller.abort();
        init.signal?.addEventListener('abort', onAbort);

        let response: Response;
        try {
          response = await this.fetchImpl(`${this.apiUrl}${path}`, {
            method: init.method,
            headers: {
              Authorization: `DeepL-Auth-Key ${this.apiKey}`,
              ...(init.body ? { 'Content-Type': 'application/json' } : {}),
              Accept: 'application/json',
            },
            body: init.body,
            signal: controller.signal,
            cache: 'no-store',
          });
        } finally {
          clearTimeout(timeout);
          init.signal?.removeEventListener('abort', onAbort);
        }

        const text = await response.text();
        let json: unknown = null;
        if (text.trim() !== '') {
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
        }

        if (response.ok) {
          return { ok: true, json };
        }

        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        lastFailure = statusToFailure(response.status, retryAfterMs);
      } catch (error) {
        const aborted =
          error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
        lastFailure = aborted
          ? failure('TIMEOUT', { retryable: true })
          : failure('NETWORK', { retryable: true });
      }

      if (!lastFailure.ok && lastFailure.retryable && attempt < this.maxRetries) {
        const delay =
          lastFailure.retryAfterMs ?? Math.min(400 * 2 ** attempt, 4_000);
        await this.sleep(delay);
        attempt += 1;
        continue;
      }
      break;
    }

    console.warn(
      JSON.stringify({
        event: 'translation.deepl.failed',
        provider: 'deepl',
        code: lastFailure.ok ? 'UNKNOWN' : lastFailure.code,
        status: lastFailure.ok ? undefined : lastFailure.status,
      }),
    );

    return { ok: false, failure: lastFailure };
  }
}
