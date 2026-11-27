/**
 * Per-account language preference.
 *
 * The account value is the second-highest priority in detection, so a signed-in
 * visitor keeps their language on every device. It is mirrored into the locale
 * cookie at sign-in and whenever it changes, which keeps the proxy free of
 * database lookups on the request path.
 *
 * Security note: `userId` always comes from the validated session, never from a
 * request body, and an unsupported value is rejected before it reaches SQL.
 */
import { db } from '@/lib/db';
import { isLocale, parseLocale, type Locale } from '@/i18n/config';

/** Stored language of an account, or null when unset/invalid. */
export async function getAccountLocale(userId: string): Promise<Locale | null> {
  const row = await db.orm.public.User.where({ id: userId }).select('locale').first();
  return parseLocale(row?.locale);
}

/** True when the account row was updated. */
export async function saveAccountLocale(userId: string, locale: Locale): Promise<boolean> {
  if (!isLocale(locale)) {
    return false;
  }
  await db.orm.public.User.where({ id: userId }).update({ locale });
  return true;
}
