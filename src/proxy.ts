/**
 * Next.js 16 Proxy (formerly Middleware)
 *
 * Responsibilities, in order:
 *
 * 1. **Locale resolution.** Every page lives under `/[locale]`. A request
 *    without a supported locale prefix is redirected once (307) to the locale
 *    chosen by `detectLocale()`: account → cookie → `Accept-Language` → country
 *    hint → German. The redirect is temporary on purpose — the answer depends
 *    on the visitor, so it must never be cached as a permanent alias.
 *    `/api/*`, `/_next/*` and static files are excluded by the matcher and are
 *    never redirected.
 *
 * 2. **Optimistic auth redirect.** It redirects requests that carry no
 *    NextAuth session cookie away from /developer and /admin. It deliberately
 *    does not decode the cookie, does not read the database for auth and is
 *    NOT an authorization boundary.
 *
 * 3. **Real 404 status for detail routes.** With Cache Components, a
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
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_META,
  localizePath,
  localeFromPath,
  stripLocale,
  type Locale,
} from '@/i18n/config';
import { detectLocale, shouldPersistDetection } from '@/i18n/detect';

// Routes that need a session cookie before rendering (optimistic only)
const PROTECTED_PREFIXES = ['/developer', '/admin'];

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;

const DETAIL_ROUTE_PATTERN = /^\/(plugins|themes|news)\/([^/]+)\/?$/;

/** Copy shown by the self-contained 404 below. Kept small on purpose. */
const NOT_FOUND_TEXT: Record<Locale, { title: string; body: string; home: string; plugins: string }> = {
  de: {
    title: 'Seite nicht gefunden',
    body: 'Dieser Eintrag existiert nicht, wurde zurückgezogen oder ist noch nicht freigegeben.',
    home: 'Zur Startseite',
    plugins: 'Plugins entdecken',
  },
  en: {
    title: 'Page not found',
    body: 'This entry does not exist, has been withdrawn or has not been released yet.',
    home: 'Go to the home page',
    plugins: 'Discover plugins',
  },
  nl: {
    title: 'Pagina niet gevonden',
    body: 'Dit item bestaat niet, is ingetrokken of is nog niet vrijgegeven.',
    home: 'Naar de startpagina',
    plugins: 'Plug-ins ontdekken',
  },
  fr: {
    title: 'Page introuvable',
    body: "Cette entrée n'existe pas, a été retirée ou n'est pas encore publiée.",
    home: "Aller à l'accueil",
    plugins: 'Découvrir les extensions',
  },
  es: {
    title: 'Página no encontrada',
    body: 'Esta entrada no existe, se ha retirado o aún no se ha publicado.',
    home: 'Ir al inicio',
    plugins: 'Descubrir complementos',
  },
  it: {
    title: 'Pagina non trovata',
    body: 'Questo contenuto non esiste, è stato ritirato o non è ancora pubblicato.',
    home: 'Vai alla pagina iniziale',
    plugins: 'Scopri i plugin',
  },
  pl: {
    title: 'Nie znaleziono strony',
    body: 'Ten wpis nie istnieje, został wycofany lub nie został jeszcze opublikowany.',
    home: 'Przejdź do strony głównej',
    plugins: 'Odkryj wtyczki',
  },
};

// Minimal, self-contained 404 page. It is intentionally not rendered through
// the App Router, so no framework/CDN cache directive for a prerendered page
// can be attached to a negative answer. Styling is inline to avoid shipping
// assets for a page that must never be cached.
function notFoundHtml(locale: Locale): string {
  const text = NOT_FOUND_TEXT[locale];
  const meta = LOCALE_META[locale];
  return `<!doctype html>
<html lang="${meta.code}" dir="${meta.direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>404 — ${text.title} | WebRadio</title>
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
  <h1>${text.title}</h1>
  <p>${text.body}</p>
  <nav>
    <a class="primary" href="${localizePath(locale, '/')}">${text.home}</a>
    <a class="secondary" href="${localizePath(locale, '/plugins')}">${text.plugins}</a>
  </nav>
</main>
</body>
</html>`;
}

function notFoundResponse(locale: Locale, method: string): NextResponse {
  const response = new NextResponse(method === 'HEAD' ? null : notFoundHtml(locale), {
    status: 404,
  });

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
      and(entry.slug.eq(slug), entry.isPublished.eq(true), entry.publishedAt.lte(now)),
    )
      .select('id')
      .first();
    return row !== null;
  }

  return true;
}

/**
 * Locale cookie options.
 *
 * `httpOnly` because only the server reads it (proxy and server components),
 * `sameSite=lax` so a normal top-level navigation carries it, `secure` in
 * production and `path=/` so every page sees the same choice. No personal data
 * beyond the two-letter language code is stored.
 */
function localeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  };
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  const pathLocale = localeFromPath(pathname);

  // --- Locale prefix -------------------------------------------------------
  if (!pathLocale) {
    const detection = detectLocale({
      cookie: request.cookies.get(LOCALE_COOKIE)?.value ?? null,
      acceptLanguage: request.headers.get('accept-language'),
      country: request.headers.get('x-vercel-ip-country'),
    });

    const target = new URL(localizePath(detection.locale, pathname), request.url);
    target.search = search;

    const redirect = NextResponse.redirect(target, 307);

    if (shouldPersistDetection(detection)) {
      redirect.cookies.set(LOCALE_COOKIE, detection.locale, localeCookieOptions());
    }

    return redirect;
  }

  const locale = pathLocale;
  // Everything below reasons about the locale-independent path.
  const internalPath = stripLocale(pathname);

  const requiresAuth = PROTECTED_PREFIXES.some((prefix) => internalPath.startsWith(prefix));

  if (requiresAuth) {
    const hasSessionCookie = SESSION_COOKIE_NAMES.some(
      (name) => request.cookies.get(name) !== undefined,
    );

    if (!hasSessionCookie) {
      const loginUrl = new URL(localizePath(locale, '/auth/login'), request.url);
      loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  const detailMatch = internalPath.match(DETAIL_ROUTE_PATTERN);
  if (detailMatch && (request.method === 'GET' || request.method === 'HEAD')) {
    const kind = detailMatch[1]!;
    let slug = detailMatch[2]!;

    try {
      slug = decodeURIComponent(slug);
    } catch {
      return notFoundResponse(locale, request.method);
    }

    try {
      const exists = await publishedDetailExists(kind, slug);
      if (!exists) {
        return notFoundResponse(locale, request.method);
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
   *   - api           (route handlers are not localized)
   *   - _next/static  (Next.js static assets)
   *   - _next/image   (Next.js image optimisation)
   *   - favicon.ico
   *   - public assets (images, fonts, robots.txt, sitemap.xml, …)
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
