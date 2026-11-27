/**
 * Display formatting helpers.
 *
 * Every helper accepts an optional locale and delegates to `Intl` through
 * `src/i18n/format.ts`. The default stays German, so existing server code keeps
 * its output while a page that knows its locale can opt in:
 *
 *   formatDate(value, locale)
 *
 * The time zone is a fixed application concern (UTC for dates, Central European
 * Time for date-times) and never changes with the language: switching to Polish
 * must not move an event to another hour.
 */
import { createFormatters, type DateInput } from '@/i18n/format';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export type { DateInput };

/** Format an ISO timestamp as a date in the given language. */
export function formatDate(value: DateInput, locale: Locale = DEFAULT_LOCALE): string | null {
  return createFormatters(locale).date(value);
}

/** Format an ISO timestamp as date and time (Europe/Berlin) in the given language. */
export function formatDateTime(value: DateInput, locale: Locale = DEFAULT_LOCALE): string | null {
  return createFormatters(locale).dateTime(value);
}

/** 1536 -> "1,5 KB"; null/undefined -> null. */
export function formatFileSize(
  bytes: number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  return createFormatters(locale).fileSize(bytes);
}

export function formatNumber(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return createFormatters(locale).number(value);
}

export type ReleaseChannel = 'stable' | 'beta';

/**
 * Derive the release channel from SemVer prerelease syntax. There is no
 * separate channel column in the contract, so nothing else is inferred.
 */
export function releaseChannel(version: string): ReleaseChannel {
  return version.includes('-') ? 'beta' : 'stable';
}

const CHANNEL_LABEL_KEYS = {
  stable: 'Stabil',
  beta: 'Beta',
} as const;

/**
 * Channel label. The German wording is kept for existing call sites; translate
 * through `releaseChannelKey` when rendering in the visitor's language.
 */
export function releaseChannelLabel(version: string): string {
  return CHANNEL_LABEL_KEYS[releaseChannel(version)];
}

/** Stable translation-independent channel key. */
export function releaseChannelKey(version: string): ReleaseChannel {
  return releaseChannel(version);
}
