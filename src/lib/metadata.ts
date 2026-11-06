import { absoluteUrl, safeHttpUrl } from '@/lib/site';

export type SocialImage = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

/** The site-wide fallback image used when a page has no preview of its own. */
export const DEFAULT_SOCIAL_IMAGE_PATH = '/brand/webradio-logo.png';

/**
 * Default Open Graph image. It is returned empty when no public site URL is
 * configured, because an absolute URL is required and a local development URL
 * must never end up in production metadata.
 */
export function defaultSocialImages(): SocialImage[] {
  const url = absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH);
  return url ? [{ url, width: 256, height: 256, alt: 'WebRadio Logo' }] : [];
}

/**
 * A page's own preview image wins; otherwise the site default applies. Without
 * this, a page that sets its own `openGraph` object would lose the inherited
 * image, because Next.js replaces nested metadata instead of merging it.
 */
export function socialImagesFor(candidate?: string | null): SocialImage[] {
  const url = safeHttpUrl(candidate);
  return url ? [{ url, alt: 'Vorschaubild' }] : defaultSocialImages();
}
