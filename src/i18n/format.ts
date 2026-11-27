/**
 * Locale-aware display formatting.
 *
 * Two rules shape this module:
 *
 * 1. The language changes *presentation*, never meaning. So the time zone and
 *    the currency are explicit parameters with fixed defaults — switching the
 *    UI to Polish must not silently reinterpret a timestamp in another zone or
 *    relabel an amount in another currency.
 * 2. Everything goes through `Intl`; there is no hand-written separator or
 *    month-name table anywhere in the codebase.
 */
import type { Locale } from './config';

/** BCP-47 tags give `Intl` the regional conventions behind each language. */
const INTL_LOCALES: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  nl: 'nl-NL',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pl: 'pl-PL',
};

/**
 * The application has always rendered timestamps in UTC for dates and in
 * Central European Time for date-times. Keeping that as the default means a
 * language switch never moves an event to another hour.
 */
export const DEFAULT_DATE_TIME_ZONE = 'Europe/Berlin';
export const DEFAULT_DATE_TIME_ZONE_DATE = 'UTC';

export type DateInput = string | Date | { toString(): string } | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export type LocaleFormatters = {
  /** `12. März 2026` / `12 March 2026`. */
  date: (value: DateInput) => string | null;
  /** Date and time in the same fixed zone. */
  dateTime: (value: DateInput) => string | null;
  /** Grouping and decimal separators for the locale. */
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Currency formatting; the currency is never inferred from the locale. */
  currency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;
  percent: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** `vor 3 Tagen`, `3 days ago`. */
  relative: (value: DateInput, now?: Date) => string | null;
  /** `1,5 MB`. */
  fileSize: (bytes: number | null | undefined) => string | null;
};

export function createFormatters(
  locale: Locale,
  options: { timeZone?: string; dateTimeZone?: string } = {},
): LocaleFormatters {
  const intlLocale = INTL_LOCALES[locale] ?? INTL_LOCALES.de;
  const timeZone = options.timeZone ?? DEFAULT_DATE_TIME_ZONE;
  const dateTimeZone = options.dateTimeZone ?? DEFAULT_DATE_TIME_ZONE_DATE;

  let dateFormatter: Intl.DateTimeFormat | undefined;
  let dateTimeFormatter: Intl.DateTimeFormat | undefined;
  let relativeFormatter: Intl.RelativeTimeFormat | undefined;

  return {
    date(value) {
      const date = toDate(value);
      if (!date) {
        return null;
      }
      dateFormatter ??= new Intl.DateTimeFormat(intlLocale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: dateTimeZone,
      });
      return dateFormatter.format(date);
    },

    dateTime(value) {
      const date = toDate(value);
      if (!date) {
        return null;
      }
      dateTimeFormatter ??= new Intl.DateTimeFormat(intlLocale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      });
      return dateTimeFormatter.format(date);
    },

    number(value, numberOptions) {
      return new Intl.NumberFormat(intlLocale, numberOptions).format(value);
    },

    currency(value, currency, currencyOptions) {
      return new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency,
        ...currencyOptions,
      }).format(value);
    },

    percent(value, percentOptions) {
      return new Intl.NumberFormat(intlLocale, {
        style: 'percent',
        ...percentOptions,
      }).format(value);
    },

    relative(value, now = new Date()) {
      const date = toDate(value);
      if (!date) {
        return null;
      }
      relativeFormatter ??= new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
      const seconds = (date.getTime() - now.getTime()) / 1000;
      const thresholds: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 60 * 60 * 24 * 365],
        ['month', 60 * 60 * 24 * 30],
        ['week', 60 * 60 * 24 * 7],
        ['day', 60 * 60 * 24],
        ['hour', 60 * 60],
        ['minute', 60],
        ['second', 1],
      ];
      for (const [unit, size] of thresholds) {
        if (Math.abs(seconds) >= size || unit === 'second') {
          return relativeFormatter.format(Math.round(seconds / size), unit);
        }
      }
      return null;
    },

    fileSize(bytes) {
      if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
        return null;
      }
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      const formatted = new Intl.NumberFormat(intlLocale, {
        maximumFractionDigits: unit === 0 ? 0 : 1,
      }).format(value);
      return `${formatted} ${units[unit]}`;
    },
  };
}

/** Intl tag for a locale, exported for callers that need it directly. */
export function intlLocale(locale: Locale): string {
  return INTL_LOCALES[locale] ?? INTL_LOCALES.de;
}
