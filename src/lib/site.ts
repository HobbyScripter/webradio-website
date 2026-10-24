/**
 * Project-level constants and URL helpers.
 *
 * Only real, verifiable destinations belong here. There is intentionally no
 * Discord/forum/legal page entry until such content exists.
 */
export const SITE_NAME = 'WebRadio';
export const SITE_TAGLINE = 'Das offene Ökosystem für dein WebRadio';
export const SITE_DESCRIPTION =
  'WebRadio ist ein Open-Source-Projekt für ein erweiterbares Webradio-Ökosystem: Plugins, Themes, Releases und Entwicklerwerkzeuge an einem Ort.';

/** Actual git remote of this repository (verified with `git remote -v`). */
export const REPOSITORY_URL = 'https://github.com/HobbyScripter/webradio-website';
export const REPOSITORY_DOCS_URL = `${REPOSITORY_URL}/tree/master/docs`;
export const REPOSITORY_README_URL = `${REPOSITORY_URL}/blob/master/README.md`;
export const REPOSITORY_ISSUES_URL = `${REPOSITORY_URL}/issues`;

/**
 * Public base URL, only when it is explicitly configured.
 *
 * Canonical URLs, Open Graph URLs and the sitemap are omitted without it, so a
 * local development URL never ends up in production metadata.
 */
export function getSiteUrl(): string | null {
  const raw = process.env['NEXT_PUBLIC_SITE_URL']?.trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Absolute URL for a path, or undefined when no public site URL is configured. */
export function absoluteUrl(path: string): string | undefined {
  const base = getSiteUrl();
  if (!base) {
    return undefined;
  }

  try {
    return new URL(path, `${base}/`).toString();
  } catch {
    return undefined;
  }
}

/**
 * Accept only absolute http(s) URLs. Rejects javascript:, data:, malformed
 * values and URLs with embedded credentials.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
