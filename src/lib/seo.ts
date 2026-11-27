/**
 * Language-aware SEO metadata.
 *
 * Every indexable page declares its own path here, which produces:
 *
 *   - one canonical URL for the page in the current language,
 *   - one `hreflang` alternate per supported locale,
 *   - `x-default` pointing at the German source,
 *   - a language-correct title and description.
 *
 * A page must never inherit another page's canonical URL, which is why this
 * helper lives next to the pages and not in the root layout.
 */
import type { Metadata } from 'next';
import { absoluteUrl, SITE_NAME } from '@/lib/site';
import { defaultSocialImages } from '@/lib/metadata';
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, localizePath, type Locale } from '@/i18n/config';

export type LanguageAlternates = {
  canonical?: string;
  languages?: Record<string, string>;
};

/**
 * `hreflang` map for a locale-independent path (`/plugins`).
 *
 * Returns an empty object when no public site URL is configured, so a local
 * development host can never end up in production metadata.
 */
export function buildLanguageAlternates(path: string): LanguageAlternates {
  const canonical = absoluteUrl(localizePath(DEFAULT_LOCALE, path));
  if (!canonical) {
    return {};
  }

  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    const url = absoluteUrl(localizePath(locale, path));
    if (url) {
      languages[locale] = url;
    }
  }
  const xDefault = absoluteUrl(localizePath(DEFAULT_LOCALE, path));
  if (xDefault) {
    languages['x-default'] = xDefault;
  }

  return { canonical, languages };
}

/**
 * Canonical URL for one page *in its own language* plus the full alternate map.
 *
 * `canonical` intentionally points at the current locale so that `/en/plugins`
 * is not reported as a duplicate of `/de/plugins`; the `hreflang` cluster tells
 * search engines that the two are translations of one page.
 */
export function alternatesFor(locale: Locale, path: string): LanguageAlternates {
  const map = buildLanguageAlternates(path);
  const canonical = absoluteUrl(localizePath(locale, path));
  return {
    ...(canonical ? { canonical } : {}),
    ...(map.languages ? { languages: map.languages } : {}),
  };
}

/** True when the locale is fully translated for public content. */
export function isPublicLocale(locale: Locale): boolean {
  return LOCALES.includes(locale);
}

/** `openGraph` locale value for a page. */
export function openGraphLocale(locale: Locale): string {
  return LOCALE_META[locale].openGraph;
}

type PageMetadataInput = {
  locale: Locale;
  /** Locale-independent path, e.g. `/plugins`. */
  path: string;
  /** Already translated page title (without the site suffix). */
  title: string;
  /** Already translated description. */
  description: string;
  /** Set for the home page, whose title must not get the `· WebRadio` suffix. */
  absoluteTitle?: boolean;
  openGraphType?: 'website' | 'article';
  publishedTime?: string;
  robots?: Metadata['robots'];
};

/**
 * Metadata for one public page in one language.
 *
 * Every page that is indexable goes through this helper so that the three
 * language signals can never drift apart again:
 *
 *   - `title`/`description` are the translated strings of the active locale,
 *   - the canonical URL points at the *same* page in the *same* language,
 *   - `hreflang` lists all seven languages plus `x-default` (German).
 *
 * Without this a page exported one static German metadata object for all
 * locales, which produced German titles on `/en/…` and a canonical URL that
 * redirected back to the German version.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const { locale, path, title, description } = input;
  const url = absoluteUrl(localizePath(locale, path));
  const socialTitle = `${title} · ${SITE_NAME}`;
  const alternates = alternatesFor(locale, path);
  const languages =
    alternates.canonical || alternates.languages
      ? {
          ...(alternates.canonical ? { canonical: alternates.canonical } : {}),
          ...(alternates.languages ? { languages: alternates.languages } : {}),
        }
      : undefined;

  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    ...(languages ? { alternates: languages } : {}),
    ...(input.robots ? { robots: input.robots } : {}),
    openGraph: {
      type: input.openGraphType ?? 'website',
      title: socialTitle,
      description,
      siteName: SITE_NAME,
      locale: openGraphLocale(locale),
      alternateLocale: LOCALES.filter((entry) => entry !== locale).map(openGraphLocale),
      ...(url ? { url } : {}),
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      images: defaultSocialImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
    },
  };
}
