import 'temporal-polyfill/global';
import type * as DbModule from '../db';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('../db');
  return mod.db;
}

export const PAGE_VIEW_RETENTION_DAYS = 90;
export const DOWNLOAD_REQUEST_RETENTION_DAYS = 90;

const MAX_PATH_LENGTH = 200;
const MAX_HOST_LENGTH = 200;

export const EXCLUDED_PATH_PREFIXES = ['/admin', '/auth', '/api', '/account', '/_next'] as const;

const BOT_PATTERN =
  /bot\b|crawler|spider|preview|headless|curl\/|wget\/|python-requests|facebookexternalhit|slackbot|whatsapp|telegrambot|discordbot|bingpreview|google-inspectiontool/i;

/**
 * Do Not Track and Global Privacy Control are honored by not counting the
 * request at all. No identifier is stored either way.
 */
export function isTrackingOptOut(headers: Headers): boolean {
  return headers.get('dnt') === '1' || headers.get('sec-gpc') === '1';
}

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && BOT_PATTERN.test(userAgent));
}

/**
 * Reduces a client-supplied path to a route-like value: no origin, query,
 * fragment or duplicate slashes. Admin, auth and account routes are excluded.
 */
export function normalizePagePath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 500) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return null;
  if (!raw.startsWith('/')) return null;

  let pathname: string;
  try {
    pathname = new URL(raw, 'https://webradio.invalid').pathname;
  } catch {
    return null;
  }

  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname.length > MAX_PATH_LENGTH) return null;
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }
  return pathname || '/';
}

/** Only the hostname is kept; path, query and credentials are dropped. */
export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return '';
  try {
    const url = new URL(referrer);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.hostname.toLowerCase().slice(0, MAX_HOST_LENGTH);
  } catch {
    return '';
  }
}

export function countryCodeFromHeaders(headers: Headers): string {
  const country =
    headers.get('x-vercel-ip-country') ||
    headers.get('cf-ipcountry') ||
    headers.get('x-country-code') ||
    '';
  return /^[A-Za-z]{2}$/.test(country.trim()) ? country.trim().toUpperCase() : 'XX';
}

export function classifyDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'unknown';
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile/i.test(userAgent)) return 'mobile';
  if (/windows|macintosh|linux|x11|android/i.test(userAgent)) return 'desktop';
  return 'unknown';
}

export function classifyOs(userAgent: string | null | undefined): string {
  if (!userAgent) return 'unknown';
  if (/windows/i.test(userAgent)) return 'windows';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  if (/mac os x|macintosh/i.test(userAgent)) return 'macos';
  if (/linux|x11|bsd/i.test(userAgent)) return 'linux';
  return 'other';
}

/** Architecture is inferred from the asset file name only, never from the UA. */
export function detectArch(fileName: string | null | undefined): string {
  if (!fileName) return '';
  if (/arm64|aarch64/i.test(fileName)) return 'arm64';
  if (/armv7|armhf/i.test(fileName)) return 'arm';
  if (/x64|amd64|x86_64/i.test(fileName)) return 'x64';
  if (/ia32|i386|x86/i.test(fileName)) return 'x86';
  return '';
}

function utcDay(now: Date): Temporal.Instant {
  return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO('UTC').startOfDay().toInstant();
}

export type PageViewInput = {
  path: string;
  referrer?: string | null;
  headers: Headers;
  now?: Date;
};

/**
 * Increments the daily aggregate for one page view. The dimensions are coarse
 * and anonymous; no IP, cookie, user id or user agent is stored.
 */
export async function trackPageView(input: PageViewInput): Promise<void> {
  const path = normalizePagePath(input.path);
  if (!path) return;

  const day = utcDay(input.now ?? new Date());
  const where = {
    day,
    path,
    referrerHost: referrerHost(input.referrer),
    countryCode: countryCodeFromHeaders(input.headers),
    deviceType: classifyDevice(input.headers.get('user-agent')),
    os: classifyOs(input.headers.get('user-agent')),
  };

  const db = await getDb();
  const model = db.orm.public.WebsitePageViewDaily;

  try {
    const existing = await model.first(where);
    if (existing) {
      await model.where({ id: existing.id }).update({ count: existing.count + 1 });
      return;
    }
    await model.create({ ...where, count: 1 });
  } catch {
    // A concurrent request may have created the same aggregate row. Retry once
    // as an increment; a second failure is swallowed by the caller.
    const existing = await model.first(where);
    if (existing) {
      await model.where({ id: existing.id }).update({ count: existing.count + 1 });
    }
  }
}

export type DownloadRequestInput = {
  assetId: string;
  releaseTag: string;
  channel: string;
  platform?: string | null;
  fileName?: string | null;
  referrer?: string | null;
  headers: Headers;
  now?: Date;
};

/**
 * Records a download *request* (not a confirmed successful download). This is
 * deliberately separate from `WebsiteDownloadStat` so existing aggregates are
 * not double counted.
 */
export async function recordDownloadRequest(input: DownloadRequestInput): Promise<void> {
  const day = utcDay(input.now ?? new Date());
  const where = {
    day,
    assetId: input.assetId.slice(0, 100),
    releaseTag: (input.releaseTag ?? '').slice(0, 100),
    channel: (input.channel ?? '').slice(0, 40),
    platform: (input.platform ?? '').slice(0, 40),
    arch: detectArch(input.fileName),
    countryCode: countryCodeFromHeaders(input.headers),
    referrerHost: referrerHost(input.referrer),
  };

  const db = await getDb();
  const model = db.orm.public.WebsiteDownloadRequestDaily;

  try {
    const existing = await model.first(where);
    if (existing) {
      await model.where({ id: existing.id }).update({ count: existing.count + 1 });
      return;
    }
    await model.create({ ...where, count: 1 });
  } catch {
    const existing = await model.first(where);
    if (existing) {
      await model.where({ id: existing.id }).update({ count: existing.count + 1 });
    }
  }
}

export type RetentionResult = {
  pageViewsDeleted: number;
  downloadRequestsDeleted: number;
};

/**
 * Deletes granular aggregates older than the documented retention windows.
 * Only anonymous daily rows are affected; no user data exists in this schema.
 */
export async function cleanupAnalyticsRetention(
  options: { now?: Date; pageViewDays?: number; downloadDays?: number } = {},
): Promise<RetentionResult> {
  const now = Temporal.Instant.from((options.now ?? new Date()).toISOString());
  const pageViewCutoff = now.subtract({
    hours: (options.pageViewDays ?? PAGE_VIEW_RETENTION_DAYS) * 24,
  });
  const downloadCutoff = now.subtract({
    hours: (options.downloadDays ?? DOWNLOAD_REQUEST_RETENTION_DAYS) * 24,
  });

  const db = await getDb();
  const pageViews = await db.orm.public.WebsitePageViewDaily.where((row) =>
    row.day.lt(pageViewCutoff),
  ).deleteAll();
  const downloads = await db.orm.public.WebsiteDownloadRequestDaily.where((row) =>
    row.day.lt(downloadCutoff),
  ).deleteAll();

  return {
    pageViewsDeleted: pageViews.length,
    downloadRequestsDeleted: downloads.length,
  };
}
