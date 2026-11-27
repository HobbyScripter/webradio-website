/**
 * Server-side i18n helpers.
 *
 * `[locale]/layout.tsx` receives the locale as a route parameter, which is the
 * authoritative value for a rendered page. These helpers cover the remaining
 * server contexts — route handlers, server actions and e-mail templates — where
 * no route parameter exists: there the stored cookie is used.
 */
import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale, type Locale } from './config';
import { detectLocale } from './detect';
import { createFormatters, type LocaleFormatters } from './format';
import { getMessages } from './messages';
import { createTranslator, type Translator } from './translate';

export type ServerI18n = {
  locale: Locale;
  t: Translator;
  format: LocaleFormatters;
};

/** Build the translator bundle for a known locale. */
export function createServerI18n(locale: Locale): ServerI18n {
  const messages = getMessages(locale);
  return {
    locale,
    t: createTranslator(locale, messages, getMessages(DEFAULT_LOCALE)),
    format: createFormatters(locale),
  };
}

/**
 * Locale from a route/param object. `params` is a Promise in Next.js 16.
 * Falls back to the stored cookie when the param is missing or unknown.
 */
export async function getLocaleFromParams(
  params: { locale?: string } | Promise<{ locale?: string }> | undefined,
): Promise<Locale> {
  const resolved = await params;
  const parsed = parseLocale(resolved?.locale);
  return parsed ?? (await getRequestLocale());
}

/**
 * Locale for the current request when no route parameter is available.
 *
 * Only the cookie and `Accept-Language` are considered: the account language is
 * mirrored into the cookie at sign-in and on every change, so it is already the
 * effective value here.
 */
export async function getRequestLocale(): Promise<Locale> {
  const [cookieStore, headerBag] = await Promise.all([cookies(), headers()]);

  const result = detectLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: headerBag.get('accept-language'),
    country: headerBag.get('x-vercel-ip-country'),
  });

  return result.locale;
}

/** Translator bundle for the current request. */
export async function getI18n(): Promise<ServerI18n> {
  return createServerI18n(await getRequestLocale());
}

/** Translator bundle for a known locale. */
export async function getI18nFor(locale: Locale): Promise<ServerI18n> {
  return createServerI18n(locale);
}
