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
 *    before rendering lets us answer with a real 404. The response is built
 *    here instead of rewriting to `/404`: a rendered 404 page can inherit
 *    Next.js/CDN caching headers, which would leave a negative hit (for a
 *    slug that is published later) cached. This response is explicitly
 *    `no-store` for every cache layer.
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
import { WEBRADIO_PRODUCT } from '@/lib/product';

// Routes that need a session cookie before rendering (optimistic only)
const PROTECTED_PREFIXES = ['/developer', '/admin'];

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;

const DETAIL_ROUTE_PATTERN = /^\/(plugins|themes|news)\/([^/]+)\/?$/;

// Minimal, self-contained 404 page. It is intentionally not rendered through
// the App Router, so no framework/CDN cache directive for a prerendered page
// can be attached to a negative answer. Styling is inline to avoid shipping
// assets for a page that must never be cached.
const NOT_FOUND_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>404 — Seite nicht gefunden | WebRadio</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
    background: #09090b; color: #f4f4f5; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(32rem, 100%); text-align: center; }
  .code { display: inline-grid; place-items: center; width: 5rem; height: 5rem; border-radius: 1rem;
    border: 1px solid rgb(139 92 246 / .25); background: rgb(139 92 246 / .1);
    color: #c4b5fd; font: 700 1.5rem/1 ui-monospace, monospace; }
  h1 { margin: 1.5rem 0 .75rem; font-size: clamp(1.75rem, 5vw, 2.5rem); letter-spacing: -.02em; }
  p { margin: 0 auto; max-width: 28rem; color: #a1a1aa; line-height: 1.6; }
  nav { display: flex; flex-wrap: wrap; gap: .75rem; justify-content: center; margin-top: 2rem; }
  a { display: inline-block; padding: .7rem 1.2rem; border-radius: .75rem; font-size: .9rem;
    font-weight: 600; text-decoration: none; }
  a.primary { background: #7c3aed; color: #fff; }
  a.secondary { border: 1px solid #3f3f46; background: #18181b; color: #e4e4e7; }
  a:focus-visible { outline: 3px solid #a78bfa; outline-offset: 3px; }
</style>
</head>
<body>
<main>
  <div class="code">404</div>
  <h1>Seite nicht gefunden</h1>
  <p>Dieser Eintrag existiert nicht, wurde zurückgezogen oder ist noch nicht freigegeben.</p>
  <nav>
    <a class="primary" href="/">Zur Startseite</a>
    <a class="secondary" href="/plugins">Plugins entdecken</a>
  </nav>
</main>
</body>
</html>`;

function notFoundResponse(request: NextRequest): NextResponse {
  const response = new NextResponse(
    request.method === 'HEAD' ? null : NOT_FOUND_HTML,
    { status: 404 },
  );

  response.headers.set('Content-Type', 'text/html; charset=utf-8');
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  // Vercel's CDN prefers these headers over Cache-Control when present.
  // Setting all three keeps the negative answer out of browser, shared and
  // provider caches.
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  return response;
}

async function publishedDetailExists(kind: string, slug: string): Promise<boolean> {
  if (kind === 'plugins') {
    const row = await db.orm.public.Plugin.where({
      slug,
      isPublished: true,
      status: 'APPROVED',
      product: WEBRADIO_PRODUCT,
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
      product: WEBRADIO_PRODUCT,
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
      return notFoundResponse(request);
    }

    try {
      const exists = await publishedDetailExists(kind, slug);
      if (!exists) {
        return notFoundResponse(request);
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
