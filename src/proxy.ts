/**
 * Next.js 16 Proxy (formerly Middleware)
 *
 * Two responsibilities:
 *
 * 1. **Optimistic auth redirect.** It redirects requests that carry no
 *    NextAuth session cookie away from /developer and /admin. It deliberately
 *    does not decode the cookie, does not read the database for auth and is
 *    NOT an authorization boundary.
 *
 * 2. **Real 404 status for detail routes.** With Cache Components, a
 *    `notFound()` that runs after an async database read has already started
 *    streaming, so the response would keep a 200 status. Checking the slug
 *    before rendering lets us rewrite unknown slugs to the 404 route.
 *
 * Authorization itself happens on the server for every protected page, route
 * handler and data access:
 *   - `requireUserSession()` / `requireDeveloperSession()` / `requireAdminSession()`
 *     in `src/lib/server-auth.ts` validate the linked database session and
 *     load the current role from PostgreSQL.
 *   - `changeUserRole()` re-checks the actor's role in the database.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` and the `middleware` export
 * to `proxy`; the old convention is deprecated. Proxy runs on the Node.js
 * runtime.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and } from '@prisma/orm-postgres/orm-client';
import { db } from '@/lib/db';

// Routes that need a session cookie before rendering (optimistic only)
const PROTECTED_PREFIXES = ['/developer', '/admin'];

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;

const DETAIL_ROUTE_PATTERN = /^\/(plugins|themes|news)\/([^/]+)\/?$/;

async function publishedDetailExists(kind: string, slug: string): Promise<boolean> {
  if (kind === 'plugins') {
    const row = await db.orm.public.Plugin.where({
      slug,
      isPublished: true,
      status: 'APPROVED',
    })
      .select('id')
      .first();
    return row !== null;
  }

  if (kind === 'themes') {
    const row = await db.orm.public.Theme.where({
      slug,
      isPublished: true,
      status: 'APPROVED',
    })
      .select('id')
      .first();
    return row !== null;
  }

  if (kind === 'news') {
    const now = Temporal.Now.instant();
    const row = await db.orm.public.News.where((entry) =>
      and(
        entry.slug.eq(slug),
        entry.isPublished.eq(true),
        entry.publishedAt.lte(now),
      ),
    )
      .select('id')
      .first();
    return row !== null;
  }

  return true;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
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

  const detailMatch = pathname.match(DETAIL_ROUTE_PATTERN);
  if (detailMatch && (request.method === 'GET' || request.method === 'HEAD')) {
    const kind = detailMatch[1]!;
    let slug = detailMatch[2]!;

    try {
      slug = decodeURIComponent(slug);
    } catch {
      return NextResponse.rewrite(new URL('/404', request.url), { status: 404 });
    }

    try {
      const exists = await publishedDetailExists(kind, slug);
      if (!exists) {
        return NextResponse.rewrite(new URL('/404', request.url), { status: 404 });
      }
    } catch {
      // A database outage is handled by the page's error state; do not turn it
      // into a 404, which would wrongly claim the entry does not exist.
      return NextResponse.next();
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
