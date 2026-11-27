/**
 * Set the interface language.
 *
 * This is a POST form endpoint on purpose: it works without JavaScript, needs no
 * client state and cannot be triggered by a cross-site image tag (unlike a GET
 * that writes a cookie). Two inputs are accepted:
 *
 *   locale — must be a supported Locale, anything else is rejected with 400
 *   next   — site-relative path to return to
 *
 * `next` is validated to be a single-slash path so this endpoint can never
 * become an open redirect. The locale prefix of `next` is replaced, and the
 * remaining path is kept, so switching language stays on the same page.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  localizePath,
} from '@/i18n/config';
import { safeNextPath } from '@/i18n/safe-next';
import { getServerAuthSession } from '@/lib/server-auth';
import { saveAccountLocale } from '@/lib/locale-preference';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const requested = form.get('locale');
  if (typeof requested !== 'string' || !isLocale(requested)) {
    return NextResponse.json({ error: 'unsupported_locale' }, { status: 400 });
  }

  const nextField = form.get('next');
  const next = safeNextPath(typeof nextField === 'string' ? nextField : null);

  // Persist to the account when signed in. The session is the only source of
  // the user id; a failure here must not block the cookie.
  try {
    const session = await getServerAuthSession();
    if (session?.user?.id) {
      await saveAccountLocale(session.user.id, requested);
    }
  } catch {
    // Language switching must stay available even during a database hiccup.
  }

  // A relative Location keeps the host the visitor actually used. Building the
  // target from `request.url` would redirect to the server's internal origin
  // when the app runs behind a proxy or under another host name.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: localizePath(requested, next), 'Cache-Control': 'no-store' },
  });
  response.cookies.set(LOCALE_COOKIE, requested, cookieOptions());
  return response;
}

/** GET only reports the accepted values; it never changes anything. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'method_not_allowed', defaultLocale: DEFAULT_LOCALE },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } },
  );
}
