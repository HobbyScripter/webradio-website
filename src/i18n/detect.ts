/**
 * Language detection — pure functions, no framework imports.
 *
 * Priority (highest first), exactly as specified:
 *
 *   1. an explicit choice in the URL (`/en/…`) — the visitor navigated there;
 *   2. the language stored in the visitor's account;
 *   3. the language stored in the cookie (a manual choice on this device);
 *   4. the browser's `Accept-Language` header;
 *   5. the country, only when it maps to exactly one language;
 *   6. German.
 *
 * The country is deliberately last and weak: `CH`, `BE` and `CA` map to
 * several languages and therefore contribute nothing. Detection never needs
 * JavaScript, a redirect chain or a Geo-IP service: the caller supplies the
 * header or cookie it already has.
 */
import { DEFAULT_LOCALE, languageForCountry, matchLocaleTag, type Locale } from './config';

export type LocaleSource = 'explicit' | 'account' | 'cookie' | 'header' | 'country' | 'default';

export type LocaleDetectionInput = {
  /** First path segment, if it is a supported locale. */
  explicit?: string | null;
  /** `User.locale` of the signed-in account. */
  account?: string | null;
  /** `webradio-locale` cookie. */
  cookie?: string | null;
  /** Raw `Accept-Language` header. */
  acceptLanguage?: string | null;
  /** Two-letter country code from a trusted edge header, if available. */
  country?: string | null;
};

export type LocaleDetectionResult = {
  locale: Locale;
  source: LocaleSource;
};

/**
 * Parse `Accept-Language` into supported locales, ordered by the visitor's
 * preference (*q* values included). Unknown languages are dropped rather than
 * mapped to a default, so `pt-BR, pt` yields no preference at all.
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) {
    return [];
  }

  const entries: Array<{ locale: Locale; quality: number; index: number }> = [];

  header.split(',').forEach((part, index) => {
    const [tag, ...parameters] = part.trim().split(';');
    const locale = matchLocaleTag(tag);
    if (!locale) {
      return;
    }

    let quality = 1;
    for (const parameter of parameters) {
      const [name, value] = parameter.trim().split('=');
      if (name?.toLowerCase() === 'q') {
        const parsed = Number.parseFloat(value ?? '');
        if (Number.isFinite(parsed)) {
          quality = parsed;
        }
      }
    }

    // q=0 explicitly rejects a language.
    if (quality <= 0) {
      return;
    }

    if (!entries.some((entry) => entry.locale === locale)) {
      entries.push({ locale, quality, index });
    }
  });

  return entries
    .sort((a, b) => (b.quality === a.quality ? a.index - b.index : b.quality - a.quality))
    .map((entry) => entry.locale);
}

/** Resolve the locale for a request. Never throws and never returns an invalid value. */
export function detectLocale(input: LocaleDetectionInput): LocaleDetectionResult {
  const explicit = matchLocaleTag(input.explicit);
  if (explicit) {
    return { locale: explicit, source: 'explicit' };
  }

  const account = matchLocaleTag(input.account);
  if (account) {
    return { locale: account, source: 'account' };
  }

  const cookie = matchLocaleTag(input.cookie);
  if (cookie) {
    return { locale: cookie, source: 'cookie' };
  }

  const fromHeader = parseAcceptLanguage(input.acceptLanguage)[0];
  if (fromHeader) {
    return { locale: fromHeader, source: 'header' };
  }

  const fromCountry = languageForCountry(input.country);
  if (fromCountry) {
    return { locale: fromCountry, source: 'country' };
  }

  return { locale: DEFAULT_LOCALE, source: 'default' };
}

/**
 * Whether the resolved locale should be written back to the cookie.
 *
 * A detected language is persisted so the *same* language is used on the next
 * visit even if the browser sends a different `Accept-Language` then. An
 * explicit URL never triggers a write: navigating to `/fr/…` once must not
 * change the visitor's stored preference.
 */
export function shouldPersistDetection(result: LocaleDetectionResult): boolean {
  return result.source === 'account' || result.source === 'header' || result.source === 'country';
}
