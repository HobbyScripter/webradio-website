/**
 * Locale ↔ provider language mapping.
 *
 * Our locales are BCP-47 primary subtags (`de`, `en`, …); DeepL uses upper-case
 * codes and distinguishes English variants. This module is the only place that
 * knows about provider codes, so a different provider only needs its own map.
 */
import { LOCALES, type Locale } from '@/i18n/config';

/** DeepL target codes for every locale we support. */
const DEEPL_TARGETS: Record<Locale, string> = {
  de: 'DE',
  en: 'EN-GB',
  nl: 'NL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
};

/** DeepL source codes. English is variant-agnostic as a source. */
const DEEPL_SOURCES: Record<Locale, string> = {
  de: 'DE',
  en: 'EN',
  nl: 'NL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
};

export function toDeepLTarget(locale: Locale): string | null {
  return DEEPL_TARGETS[locale] ?? null;
}

export function toDeepLSource(locale: Locale): string | null {
  return DEEPL_SOURCES[locale] ?? null;
}

/**
 * Map a provider code back to one of our locales.
 *
 * `EN-US` and `EN-GB` both mean `en`; an unknown code returns `null` rather
 * than guessing, so a provider language we cannot serve is ignored.
 */
export function fromDeepLCode(code: string): Locale | null {
  const normalized = code.trim().toUpperCase();
  const primary = normalized.split('-')[0];
  for (const locale of LOCALES) {
    if (DEEPL_SOURCES[locale] === primary || DEEPL_TARGETS[locale] === normalized) {
      return locale;
    }
  }
  return null;
}

/**
 * Intersect the locales we ship with the target codes a provider reports.
 *
 * The result drives the admin UI ("DeepL can translate into …") and keeps an
 * unsupported locale from being queued at all.
 */
export function intersectTargetLanguages(providerCodes: readonly string[]): Locale[] {
  const available = new Set(
    providerCodes.map((code) => code.trim().toUpperCase().split('-')[0]).filter(Boolean),
  );
  return LOCALES.filter((locale) => {
    const code = DEEPL_TARGETS[locale];
    return code !== undefined && available.has(code.split('-')[0]);
  });
}

/** All locales DeepL can serve as targets with this integration. */
export const DEEPL_SUPPORTED_TARGETS: readonly Locale[] = LOCALES;
