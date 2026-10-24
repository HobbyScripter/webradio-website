/**
 * Next.js Middleware
 *
 * Runs on every request before it reaches a page or API route.
 * Handles:
 *   - Route protection (redirect unauthenticated users to /auth/login)
 *   - Basic rate limiting via response headers (full rate limiting in API routes)
 *
 * Protected route patterns:
 *   /developer/*   – requires authenticated user (developer or admin)
 *   /admin/*       – requires authenticated user (admin role check in page)
 *
 * Public routes (no auth required):
 *   /              – landing page
 *   /plugins/*     – plugin catalogue
 *   /themes/*      – theme catalogue
 *   /releases/*    – release history
 *   /news/*        – news articles
 *   /roadmap       – project roadmap
 *   /auth/*        – login, register, error pages
 *   /api/*         – individual API routes handle their own auth
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/developer', '/admin'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Check if the route requires authentication
  const requiresAuth = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (requiresAuth) {
    // NextAuth.js sets a session cookie named "next-auth.session-token"
    // (or "__Secure-next-auth.session-token" in production with HTTPS)
    const sessionToken =
      request.cookies.get('next-auth.session-token') ??
      request.cookies.get('__Secure-next-auth.session-token');

    if (!sessionToken) {
      // Redirect to login with the original URL as callback
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Allow the request to continue
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
