import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Seite nicht gefunden',
  robots: { index: false, follow: false },
};

/**
 * Reached only through the proxy rewrite for unknown plugin/theme/news slugs.
 * Calling notFound() before any await keeps the HTTP status at 404.
 */
export default function NotFoundRoute(): void {
  notFound();
}
