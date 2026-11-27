/**
 * Central locale configuration.
 *
 * Adding a language means: add its code here, add `messages/<code>.json` with
 * every key translated, and nothing else — routing, detection, the language
 * selector, formatting, `hreflang` and the sitemap all derive from this list.
 */

export const LOCALES = ['de', 'en', 'nl', 'fr', 'es', 'it', 'pl'] as const;

export type Locale = (typeof LOCALES)[number];

/** German is the authoritative source language. */
export const DEFAULT_LOCALE: Locale = 'de';

/** Cookie that stores a visitor's manual choice. */
export const LOCALE_COOKIE = 'webradio-locale';

/** One year; a manual choice must not be forgotten after a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Request header set by `src/proxy.ts` for internal consumers. It is only an
 * optimisation: every resolver also accepts an explicit locale.
 */
export const LOCALE_HEADER = 'x-webradio-locale';

export type LocaleMeta = {
  /** BCP-47 tag used for `Intl` and `lang`/`hreflang`. */
  code: Locale;
  /** Endonym shown in the selector. */
  nativeName: string;
  /** English name, used in admin views and documentation. */
  englishName: string;
  /** Optional flag emoji. Never the only visual cue — the name is always shown. */
  flag: string;
  /** `Open Graph` locale (`de_DE`), used for `og:locale`. */
  openGraph: string;
  /**
   * Text direction. All supported languages are left-to-right today; the field
   * exists so a future RTL language does not need a layout rewrite.
   */
  direction: 'ltr' | 'rtl';
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  de: {
    code: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    flag: '🇩🇪',
    openGraph: 'de_DE',
    direction: 'ltr',
  },
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    flag: '🇬🇧',
    openGraph: 'en_GB',
    direction: 'ltr',
  },
  nl: {
    code: 'nl',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    flag: '🇳🇱',
    openGraph: 'nl_NL',
    direction: 'ltr',
  },
  fr: {
    code: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    flag: '🇫🇷',
    openGraph: 'fr_FR',
    direction: 'ltr',
  },
  es: {
    code: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    flag: '🇪🇸',
    openGraph: 'es_ES',
    direction: 'ltr',
  },
  it: {
    code: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    flag: '🇮🇹',
    openGraph: 'it_IT',
    direction: 'ltr',
  },
  pl: {
    code: 'pl',
    nativeName: 'Polski',
    englishName: 'Polish',
    flag: '🇵🇱',
    openGraph: 'pl_PL',
    direction: 'ltr',
  },
};

/** True for a supported locale code. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Narrowing helper for route params. Returns null for anything unknown. */
export function parseLocale(value: unknown): Locale | null {
  return isLocale(value) ? value : null;
}

/**
 * Map a BCP-47 tag (`de`, `de-DE`, `de_AT`, `pt-BR`) to a supported locale.
 *
 * Only the primary subtag is considered, so `de-AT`, `de-CH` and `de-DE` all
 * resolve to `de`. Returns null when nothing matches instead of guessing.
 */
export function matchLocaleTag(raw: string | null | undefined): Locale | null {
  if (!raw) {
    return null;
  }
  const primary = raw.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(primary) ? primary : null;
}

/**
 * Country hints are a *tie-breaker only*. They can never override an explicit
 * or detected language, and multilingual countries deliberately map to nothing.
 */
export const COUNTRY_LANGUAGE_HINTS: Record<string, readonly Locale[]> = {
  DE: ['de'],
  AT: ['de'],
  CH: ['de', 'fr', 'it'],
  LI: ['de'],
  GB: ['en'],
  IE: ['en'],
  US: ['en'],
  CA: ['en', 'fr'],
  AU: ['en'],
  NZ: ['en'],
  NL: ['nl'],
  BE: ['nl', 'fr'],
  FR: ['fr'],
  LU: ['fr', 'de'],
  MC: ['fr'],
  ES: ['es'],
  MX: ['es'],
  AR: ['es'],
  IT: ['it'],
  SM: ['it'],
  PL: ['pl'],
};

/**
 * A single unambiguous language for a country, or null.
 *
 * Multi-language countries return null on purpose: the visitor's browser
 * language decides there, not the country.
 */
export function languageForCountry(country: string | null | undefined): Locale | null {
  if (!country) {
    return null;
  }
  const candidates = COUNTRY_LANGUAGE_HINTS[country.trim().toUpperCase()];
  return candidates && candidates.length === 1 ? candidates[0]! : null;
}

/** Build a locale-prefixed path. `/` becomes `/{locale}`. */
export function localizePath(locale: Locale, path: string): string {
  if (!path.startsWith('/')) {
    return path;
  }
  // Already prefixed with a supported locale: keep a single prefix.
  const [, first, ...rest] = path.split('/');
  if (isLocale(first)) {
    return `/${locale}${rest.length ? `/${rest.join('/')}` : ''}`;
  }
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/** Remove a supported locale prefix. `/de/plugins` -> `/plugins`. */
export function stripLocale(path: string): string {
  const [, first, ...rest] = path.split('/');
  if (!isLocale(first)) {
    return path;
  }
  const remainder = rest.join('/');
  return remainder ? `/${remainder}` : '/';
}

/** Read the locale prefix of a path, if there is one. */
export function localeFromPath(path: string): Locale | null {
  const first = path.split('/')[1];
  return isLocale(first) ? first : null;
}
