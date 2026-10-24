/**
 * Project-level constants and URL helpers.
 *
 * The public product is the WebRadio desktop application. Its GitHub
 * repository is the authoritative source for the application, official
 * releases and the README. The website repository is a separate project and is
 * only referenced where its own source is relevant.
 *
 * Only real, verifiable destinations belong here.
 */
export const SITE_NAME = 'WebRadio';
export const SITE_TAGLINE = 'ONE WORLD. ONE SIGNAL.';
export const SITE_DESCRIPTION =
  'WebRadio ist ein quelloffener Internetradio-Player für Windows und Linux: weltweite Sendersuche, FFmpeg-Audiopipeline, Plugins, Themes und Discord Rich Presence.';

/** Official desktop project. */
export const PRODUCT_REPOSITORY_URL = 'https://github.com/YourEliteSystems/WebRadio';
export const PRODUCT_RELEASES_URL = `${PRODUCT_REPOSITORY_URL}/releases`;
export const PRODUCT_LATEST_RELEASE_URL = `${PRODUCT_RELEASES_URL}/latest`;
export const PRODUCT_ISSUES_URL = `${PRODUCT_REPOSITORY_URL}/issues`;
export const PRODUCT_DISCUSSIONS_URL = `${PRODUCT_REPOSITORY_URL}/discussions`;
export const PRODUCT_DOCS_URL = 'https://webradio.readthedocs.io/de/latest/';
export const PRODUCT_PLUGIN_SDK_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/docs/plugin-sdk/README.md`;
export const PRODUCT_THEME_SDK_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/docs/theme-sdk/README.md`;
export const PRODUCT_API_REFERENCE_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/docs/api-reference/README.md`;
export const PRODUCT_ARCHITECTURE_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/docs/architecture.md`;
export const PRODUCT_CONTRIBUTING_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/CONTRIBUTING.md`;
export const PRODUCT_CODE_OF_CONDUCT_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/CODE_OF_CONDUCT.md`;
export const PRODUCT_SECURITY_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/SECURITY.md`;
export const PRODUCT_PRIVACY_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/docs/PRIVACY.md`;
export const PRODUCT_LICENSE_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/LICENSE`;
export const PRODUCT_ROADMAP_URL = `${PRODUCT_REPOSITORY_URL}/blob/main/ROADMAP.md`;
export const PRODUCT_README_URL = `${PRODUCT_REPOSITORY_URL}#readme`;

/** Separate source repository of this website. */
export const WEBSITE_REPOSITORY_URL = 'https://github.com/HobbyScripter/webradio-website';

/**
 * Backwards-compatible aliases used across older pages. They now point at the
 * official product repository, not at this website's source.
 */
export const REPOSITORY_URL = PRODUCT_REPOSITORY_URL;
export const REPOSITORY_DOCS_URL = `${PRODUCT_REPOSITORY_URL}/tree/main/docs`;
export const REPOSITORY_README_URL = PRODUCT_README_URL;
export const REPOSITORY_ISSUES_URL = PRODUCT_ISSUES_URL;

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
