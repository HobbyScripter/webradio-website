/**
 * Provider quota (DeepL `GET /v2/usage`) for the admin dashboard.
 *
 * Design decisions:
 *
 * - **Server-side only.** The key never leaves the server; the browser receives
 *   two numbers and a status, never a credential.
 * - **Cached, not polled.** One successful or failed reading per
 *   `CACHE_TTL_MS` per process, with in-flight de-duplication, so opening the
 *   page repeatedly does not call the provider repeatedly. The stored usage
 *   summary stays untouched: a quota reading is not a billed request.
 * - **Failures are states, not exceptions.** "No provider configured", "the
 *   provider has no usage endpoint" and "the call failed with code X" are three
 *   different answers, so the UI can explain what happened instead of showing a
 *   generic "unavailable".
 */
import { createTranslationProvider, readTranslationConfig, type TranslationEnv } from './registry';
import type { TranslationErrorCode, TranslationProvider } from './types';

export type ProviderQuota =
  | { status: 'ok'; used: number; limit: number | null; checkedAt: string }
  /** DeepL is selected but `DEEPL_API_KEY` is missing: nothing was sent. */
  | { status: 'not_configured' }
  /** Provider without an account (mock) — "no quota" is the correct answer. */
  | { status: 'unsupported'; label: string }
  | { status: 'error'; code: TranslationErrorCode; checkedAt: string };

/** Ten minutes: the character count only changes when we translate. */
export const QUOTA_CACHE_TTL_MS = 10 * 60 * 1_000;

/** A slow provider must not hold the admin page open. */
const QUOTA_REQUEST_TIMEOUT_MS = 5_000;

let cached: { at: number; value: ProviderQuota } | null = null;
let inFlight: Promise<ProviderQuota> | null = null;

/** Test helper: forget the cached reading and any in-flight call. */
export function resetProviderQuotaCacheForTests(): void {
  cached = null;
  inFlight = null;
}

async function fetchQuota(
  env: TranslationEnv,
  now: number,
  injected?: TranslationProvider,
): Promise<ProviderQuota> {
  const config = readTranslationConfig(env);

  if (!injected) {
    if (config.provider !== 'deepl') {
      return { status: 'unsupported', label: 'Mock (Test)' };
    }
    if (!config.deeplConfigured) {
      return { status: 'not_configured' };
    }
  }

  const provider = injected ?? createTranslationProvider(config, env);
  if (!provider || typeof provider.usage !== 'function') {
    return { status: 'unsupported', label: provider?.label ?? config.provider };
  }

  const checkedAt = new Date(now).toISOString();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const snapshot = await Promise.race([
      provider.usage(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('quota_timeout')), QUOTA_REQUEST_TIMEOUT_MS);
      }),
    ]);

    if (!snapshot.ok) {
      return { status: 'error', code: snapshot.code, checkedAt };
    }

    return {
      status: 'ok',
      used: Math.max(0, snapshot.characterCount),
      limit:
        snapshot.characterLimit !== null && snapshot.characterLimit > 0
          ? snapshot.characterLimit
          : null,
      checkedAt,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'quota_timeout';
    return { status: 'error', code: timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR', checkedAt };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Current provider quota, from the process cache when it is still fresh.
 *
 * Never throws: a provider failure becomes `{ status: 'error', code }`.
 */
export async function readProviderQuota(
  options: {
    env?: TranslationEnv;
    now?: number;
    force?: boolean;
    /** Test seam: answer the quota from this provider instead of the registry. */
    provider?: TranslationProvider;
  } = {},
): Promise<ProviderQuota> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();

  if (!options.force && cached && now - cached.at < QUOTA_CACHE_TTL_MS) {
    return cached.value;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      return await fetchQuota(env, now, options.provider);
    } catch {
      return { status: 'error', code: 'PROVIDER_ERROR', checkedAt: new Date(now).toISOString() };
    }
  })();

  try {
    const value = await inFlight;
    cached = { at: now, value };
    return value;
  } finally {
    inFlight = null;
  }
}
