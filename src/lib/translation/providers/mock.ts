/**
 * Mock provider.
 *
 * Exists so the whole engine — jobs, statuses, history, usage, admin UI — can be
 * exercised without a DeepL key and without a single outbound request. It is
 * only reachable outside production, or when `TRANSLATION_ALLOW_MOCK=true` is
 * set explicitly (see `registry.ts`).
 *
 * The output is deterministic and clearly marked, so nobody mistakes it for a
 * real translation: `⟪en⟫ <source text>`.
 */
import { LOCALES, type Locale } from '@/i18n/config';
import { billableCharacters, protectTerms, restoreTerms } from '../protect';
import type {
  ProviderUsageSnapshot,
  TranslateInput,
  TranslationErrorCode,
  TranslationOutcome,
  TranslationProvider,
} from '../types';

export type MockOptions = {
  /** Force calls to fail with this code (used by tests). */
  failWith?: TranslationErrorCode;
  /** Number of failures before succeeding; omit for "always". */
  failTimes?: number;
  /** Fixed billed character count, to keep usage assertions stable. */
  charactersPerCall?: number;
};

export class MockProvider implements TranslationProvider {
  readonly id = 'mock' as const;
  readonly label = 'Mock (Test)';

  private remainingFailures: number;
  private readonly failureCode: string | null;
  private readonly fixedCharacters: number | null;
  public calls = 0;

  constructor(options: MockOptions = {}) {
    this.failureCode = options.failWith ?? null;
    this.remainingFailures = options.failTimes ?? Number.POSITIVE_INFINITY;
    this.fixedCharacters = options.charactersPerCall ?? null;
  }

  supportedTargets(): readonly Locale[] {
    return LOCALES;
  }

  supportsPair(_sourceLocale: Locale, targetLocale: Locale): boolean {
    return LOCALES.includes(targetLocale);
  }

  costMicros(characters: number): number {
    return characters * 10;
  }

  async usage(): Promise<ProviderUsageSnapshot> {
    return { ok: true, characterCount: this.calls * 100, characterLimit: 500_000 };
  }

  async translate(input: TranslateInput): Promise<TranslationOutcome> {
    this.calls += 1;

    if (this.failureCode && this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      return {
        ok: false,
        code: this.failureCode as never,
        retryable: this.failureCode === 'RATE_LIMITED' || this.failureCode === 'NETWORK',
      };
    }

    if (input.text.trim().length === 0) {
      return { ok: false, code: 'NOTHING_TO_TRANSLATE', retryable: false };
    }

    const { masked, terms } = protectTerms(input.text);
    const translated = `⟪${input.targetLocale}⟫ ${masked}`;
    const restored = restoreTerms(translated, terms);

    if (restored === null) {
      return { ok: false, code: 'PLACEHOLDER_LOST', retryable: false };
    }

    return {
      ok: true,
      text: restored,
      detectedSource: input.sourceLocale,
      characters: this.fixedCharacters ?? billableCharacters(masked),
    };
  }
}
