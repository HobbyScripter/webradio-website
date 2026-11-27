import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';
import { LOCALES, localizePath } from '@/i18n/config';

const PUBLIC_PATHS = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/plugins', changeFrequency: 'daily', priority: 0.9 },
  { path: '/themes', changeFrequency: 'daily', priority: 0.9 },
  { path: '/releases', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/docs', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/news', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/roadmap', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/partners', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/advertising', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/impressum', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/datenschutz', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/nutzungsbedingungen', changeFrequency: 'yearly', priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // Without an explicitly configured public base URL, emitting relative or
  // guessed URLs would be wrong, so the sitemap stays empty.
  return PUBLIC_PATHS.flatMap((entry) => {
    // `hreflang` cluster: the same page in every language, plus x-default.
    const languages: Record<string, string> = {};
    for (const locale of LOCALES) {
      const url = absoluteUrl(localizePath(locale, entry.path));
      if (url) {
        languages[locale] = url;
      }
    }
    const xDefault = absoluteUrl(localizePath('de', entry.path));
    if (xDefault) {
      languages['x-default'] = xDefault;
    }

    return LOCALES.flatMap((locale) => {
      const url = absoluteUrl(localizePath(locale, entry.path));
      return url
        ? [
            {
              url,
              changeFrequency: entry.changeFrequency,
              priority: entry.priority,
              alternates: Object.keys(languages).length > 0 ? { languages } : undefined,
            },
          ]
        : [];
    });
  });
}
