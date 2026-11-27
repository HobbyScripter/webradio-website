/**
 * Mirror the account language into the cookie.
 *
 * Called right after a successful sign-in: the account may carry a language
 * (`User.locale`) that this browser does not know yet, so without this the
 * visitor would see the browser language until they opened the settings.
 *
 * Returns 401 without a session, 204 when nothing needed to change, and the
 * effective locale otherwise. Never trusts a client-supplied user id.
 */
import { NextResponse } from 'next/server';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from '@/i18n/config';
import { getServerAuthSession } from '@/lib/server-auth';
import { getAccountLocale } from '@/lib/locale-preference';

export async function POST(): Promise<NextResponse> {
  const session = await getServerAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'unauthenticated' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let locale: Locale | null = null;
  try {
    locale = await getAccountLocale(session.user.id);
  } catch {
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!locale) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const response = NextResponse.json(
    { locale },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
  return response;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'method_not_allowed', defaultLocale: DEFAULT_LOCALE },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } },
  );
}
