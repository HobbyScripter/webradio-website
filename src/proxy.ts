/**
 * Next.js 16 Proxy (formerly Middleware)
 *
 * This is an **optimistic** check only: it redirects requests that carry no
 * NextAuth session cookie away from /developer and /admin. It deliberately
 * does not decode the cookie, does not read the database and is NOT an
 * authorization boundary.
 *
 * Authorization happens on the server for every protected page, route handler
 * and data access:
 *   - `requireUserSession()` / `requireDeveloperSession()` / `requireAdminSession()`
 *     in `src/lib/server-auth.ts` validate the linked database session and
 *     load the current role from PostgreSQL.
 *   - `changeUserRole()` re-checks the actor's role in the database.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` and the `middleware` export
 * to `proxy`; the old convention is deprecated.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that need a session cookie before rendering (optimistic only)
const PROTECTED_PREFIXES = ['/developer', '/admin'];

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const requiresAuth = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (requiresAuth) {
    const hasSessionCookie = SESSION_COOKIE_NAMES.some(
      (name) => request.cookies.get(name) !== undefined,
    );

    if (!hasSessionCookie) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all paths EXCEPT:
   *   - _next/static  (Next.js static assets)
   *   - _next/image   (Next.js image optimisation)
   *   - favicon.ico
   *   - public assets (images, fonts, etc.)
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
