import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

const PUBLIC_PATHS = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/plugins', changeFrequency: 'daily', priority: 0.9 },
  { path: '/themes', changeFrequency: 'daily', priority: 0.9 },
  { path: '/releases', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/docs', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/news', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/roadmap', changeFrequency: 'monthly', priority: 0.5 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // Without an explicitly configured public base URL, emitting relative or
  // guessed URLs would be wrong, so the sitemap stays empty.
  return PUBLIC_PATHS.flatMap((entry) => {
    const url = absoluteUrl(entry.path);
    return url
      ? [
          {
            url,
            changeFrequency: entry.changeFrequency,
            priority: entry.priority,
          },
        ]
      : [];
  });
}
