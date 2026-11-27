import type { MetadataRoute } from 'next';
import { LOCALES } from '@/i18n/config';
import { absoluteUrl } from '@/lib/site';

/**
 * Private areas exist both unprefixed and under every locale prefix. The
 * unprefixed entry alone would leave `/en/admin` crawlable, so the list is
 * generated from the supported locales instead of being written by hand.
 */
const PRIVATE_PATHS = ['/api/', '/admin', '/developer', '/auth/'];

export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl('/sitemap.xml');
  const disallow = [
    ...PRIVATE_PATHS,
    ...LOCALES.flatMap((locale) => PRIVATE_PATHS.map((path) => `/${locale}${path}`)),
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
    ],
    ...(sitemap ? { sitemap } : {}),
  };
}
