/**
 * @jest-environment node
 *
 * Unit coverage for the language system itself: locale matching, detection
 * priority, cookie persistence rules, URL prefixing, redirect safety, catalogue
 * completeness and locale-aware formatting.
 */
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  isLocale,
  languageForCountry,
  localizePath,
  localeFromPath,
  matchLocaleTag,
  parseLocale,
  stripLocale,
} from '../config';
import { detectLocale, parseAcceptLanguage, shouldPersistDetection } from '../detect';
import { MESSAGES, getMergedMessages, getMessages } from '../messages';
import { collectKeys, compareMessages, createTranslator, lookupPath } from '../translate';
import { safeNextPath } from '../safe-next';
import { createFormatters } from '../format';

describe('locale configuration', () => {
  it('supports exactly the seven documented languages', () => {
    expect(LOCALES).toEqual(['de', 'en', 'nl', 'fr', 'es', 'it', 'pl']);
    expect(DEFAULT_LOCALE).toBe('de');
  });

  it('has complete metadata for every locale', () => {
    for (const locale of LOCALES) {
      const meta = LOCALE_META[locale];
      expect(meta.code).toBe(locale);
      expect(meta.nativeName.length).toBeGreaterThan(0);
      expect(meta.englishName.length).toBeGreaterThan(0);
      expect(meta.openGraph).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      expect(meta.direction).toBe('ltr');
    }
  });

  it('validates locale input strictly', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('DE')).toBe(false);
    expect(isLocale('pt')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(parseLocale('xx')).toBeNull();
    expect(parseLocale('nl')).toBe('nl');
  });
});

describe('locale tag matching', () => {
  it('maps regional tags to their primary language', () => {
    expect(matchLocaleTag('de-DE')).toBe('de');
    expect(matchLocaleTag('de_AT')).toBe('de');
    expect(matchLocaleTag('fr-CA')).toBe('fr');
    expect(matchLocaleTag('pl')).toBe('pl');
  });

  it('does not guess for unsupported languages', () => {
    expect(matchLocaleTag('pt-BR')).toBeNull();
    expect(matchLocaleTag('')).toBeNull();
    expect(matchLocaleTag(null)).toBeNull();
  });
});

describe('country hints', () => {
  it('only resolves countries with exactly one language', () => {
    expect(languageForCountry('DE')).toBe('de');
    expect(languageForCountry('nl')).toBe('nl');
    expect(languageForCountry('GB')).toBe('en');
  });

  it('never decides for multilingual countries', () => {
    expect(languageForCountry('CH')).toBeNull();
    expect(languageForCountry('BE')).toBeNull();
    expect(languageForCountry('CA')).toBeNull();
    expect(languageForCountry('unknown')).toBeNull();
  });
});

describe('Accept-Language parsing', () => {
  it('orders by quality and keeps the first occurrence', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toEqual(['fr', 'en']);
    expect(parseAcceptLanguage('en;q=0.4,de;q=0.9')).toEqual(['de', 'en']);
    expect(parseAcceptLanguage('en, de')).toEqual(['en', 'de']);
  });

  it('drops unsupported languages and explicit rejections', () => {
    expect(parseAcceptLanguage('pt-BR,pt;q=0.9')).toEqual([]);
    expect(parseAcceptLanguage('de;q=0,en;q=0.5')).toEqual(['en']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('detection priority', () => {
  it('prefers the explicit URL segment over everything else', () => {
    expect(
      detectLocale({
        explicit: 'it',
        account: 'fr',
        cookie: 'nl',
        acceptLanguage: 'de-DE',
        country: 'DE',
      }),
    ).toEqual({ locale: 'it', source: 'explicit' });
  });

  it('prefers the account over the cookie and the browser', () => {
    expect(detectLocale({ account: 'es', cookie: 'nl', acceptLanguage: 'de' })).toEqual({
      locale: 'es',
      source: 'account',
    });
  });

  it('prefers a stored cookie over the browser language', () => {
    expect(detectLocale({ cookie: 'pl', acceptLanguage: 'de-DE' })).toEqual({
      locale: 'pl',
      source: 'cookie',
    });
  });

  it('falls back to the browser language', () => {
    expect(detectLocale({ acceptLanguage: 'fr-FR,fr;q=0.9' })).toEqual({
      locale: 'fr',
      source: 'header',
    });
  });

  it('uses the country only as the last non-default hint', () => {
    expect(detectLocale({ acceptLanguage: 'pt-BR', country: 'IT' })).toEqual({
      locale: 'it',
      source: 'country',
    });
  });

  it('falls back to German', () => {
    expect(detectLocale({})).toEqual({ locale: 'de', source: 'default' });
    expect(detectLocale({ acceptLanguage: 'pt-BR', country: 'CH' })).toEqual({
      locale: 'de',
      source: 'default',
    });
  });

  it('ignores invalid stored values instead of crashing', () => {
    expect(detectLocale({ account: 'xx', cookie: '../../etc', acceptLanguage: 'en' })).toEqual({
      locale: 'en',
      source: 'header',
    });
  });

  it('persists detected languages but not an explicit navigation', () => {
    expect(shouldPersistDetection({ locale: 'de', source: 'header' })).toBe(true);
    expect(shouldPersistDetection({ locale: 'de', source: 'account' })).toBe(true);
    expect(shouldPersistDetection({ locale: 'de', source: 'explicit' })).toBe(false);
    expect(shouldPersistDetection({ locale: 'de', source: 'cookie' })).toBe(false);
  });
});

describe('locale URL handling', () => {
  it('prefixes paths exactly once', () => {
    expect(localizePath('de', '/')).toBe('/de');
    expect(localizePath('en', '/plugins')).toBe('/en/plugins');
    expect(localizePath('fr', '/de/plugins')).toBe('/fr/plugins');
    expect(localizePath('pl', '/plugins/alpha')).toBe('/pl/plugins/alpha');
  });

  it('strips and detects the prefix', () => {
    expect(stripLocale('/de/plugins')).toBe('/plugins');
    expect(stripLocale('/de')).toBe('/');
    expect(stripLocale('/plugins')).toBe('/plugins');
    expect(localeFromPath('/nl/themes')).toBe('nl');
    expect(localeFromPath('/themes')).toBeNull();
    expect(localeFromPath('/xx/themes')).toBeNull();
  });
});

describe('open-redirect protection', () => {
  it('accepts site-relative paths and drops any locale prefix', () => {
    expect(safeNextPath('/account/profile')).toBe('/account/profile');
    expect(safeNextPath('/en/plugins?q=radio')).toBe('/plugins?q=radio');
    expect(safeNextPath(null)).toBe('/');
  });

  it('refuses absolute, protocol-relative and malformed targets', () => {
    expect(safeNextPath('https://evil.example/x')).toBe('/');
    expect(safeNextPath('//evil.example/x')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/x\nSet-Cookie: a=b')).toBe('/');
  });
});

describe('message catalogues', () => {
  const sourceKeys = collectKeys(MESSAGES[DEFAULT_LOCALE]);

  it('exposes a non-trivial number of keys', () => {
    expect(sourceKeys.length).toBeGreaterThan(100);
  });

  it.each(LOCALES.filter((locale) => locale !== DEFAULT_LOCALE))(
    '%s translates every key of the German source',
    (locale) => {
      const { missing, extra } = compareMessages(MESSAGES[DEFAULT_LOCALE], MESSAGES[locale]);
      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    },
  );

  it.each(LOCALES)('%s has no empty or whitespace-only value', (locale) => {
    const empty = collectKeys(MESSAGES[locale]).filter((key) => {
      const value = lookupPath(MESSAGES[locale], key);
      return typeof value !== 'string' || value.trim().length === 0;
    });
    expect(empty).toEqual([]);
  });

  it.each(LOCALES.filter((locale) => locale !== DEFAULT_LOCALE))(
    '%s keeps the same placeholder names as the source',
    (locale) => {
      const placeholder = /\{(\w+)\}/g;
      const mismatches: string[] = [];

      for (const key of sourceKeys) {
        const sourceValue = lookupPath(MESSAGES[DEFAULT_LOCALE], key) ?? '';
        const localeValue = lookupPath(MESSAGES[locale], key) ?? '';
        const sourceNames = [...sourceValue.matchAll(placeholder)].map((m) => m[1]).sort();
        const localeNames = [...localeValue.matchAll(placeholder)].map((m) => m[1]).sort();
        if (sourceNames.join(',') !== localeNames.join(',')) {
          mismatches.push(key);
        }
      }

      expect(mismatches).toEqual([]);
    },
  );

  it('returns the German source for an unknown locale', () => {
    expect(getMessages('xx' as never)).toBe(MESSAGES[DEFAULT_LOCALE]);
  });

  it('merges a partial translation over the German fallback', () => {
    const merged = getMergedMessages('en');
    expect(merged.nav).toEqual(expect.objectContaining({ plugins: 'Plugins' }));
  });
});

describe('translator', () => {
  const t = createTranslator('en', MESSAGES.en, MESSAGES.de);

  it('resolves dot paths and interpolates values', () => {
    expect(t('nav.plugins')).toBe('Plugins');
    expect(t('language.current', { language: 'English' })).toContain('English');
  });

  it('falls back to German for a missing key', () => {
    const partial = { nav: { plugins: 'Plugins' } };
    const translate = createTranslator('fr', partial, MESSAGES.de);
    expect(translate('nav.plugins')).toBe('Plugins');
    expect(translate('nav.themes')).toBe(lookupPath(MESSAGES.de, 'nav.themes'));
  });

  it('leaves unknown placeholders visible instead of emptying them', () => {
    expect(t('language.changed', {})).toContain('{language}');
  });
});

describe('locale formatting', () => {
  const value = '2026-03-12T15:30:00.000Z';

  it('formats dates and numbers per language without changing the zone', () => {
    const de = createFormatters('de');
    const en = createFormatters('en');

    expect(de.date(value)).toBe('12. März 2026');
    expect(en.date(value)).toBe('12 March 2026');
    expect(de.dateTime(value)).toContain('16:30');
    expect(en.dateTime(value)).toContain('16:30');
  });

  it('uses locale separators for numbers', () => {
    const de = createFormatters('de');
    const en = createFormatters('en');
    expect(de.number(1536.5)).toBe('1.536,5');
    expect(en.number(1536.5)).toBe('1,536.5');
  });

  it('formats currency from an explicit code, never from the locale', () => {
    const format = createFormatters('pl');
    expect(format.currency(12.5, 'EUR')).toContain('12,50');
    expect(format.currency(12.5, 'EUR')).toMatch(/€|EUR/);
  });

  it('returns null for invalid or missing input', () => {
    const format = createFormatters('it');
    expect(format.date(null)).toBeNull();
    expect(format.date('not-a-date')).toBeNull();
    expect(format.fileSize(-1)).toBeNull();
    expect(format.fileSize(1536)).toBe('1,5 KB');
  });
});
