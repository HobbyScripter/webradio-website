/**
 * NextAuth.js API Route Handler
 *
 * This file must be at app/api/auth/[...nextauth]/route.ts for Next.js App Router.
 * It handles all authentication endpoints:
 *   GET/POST /api/auth/signin
 *   GET/POST /api/auth/signout
 *   GET/POST /api/auth/session
 *   GET      /api/auth/csrf
 *   GET      /api/auth/providers
 *   POST     /api/auth/callback/credentials
 *
 * The POST wrapper applies the durable rate limiter to the credentials
 * callback before NextAuth runs. All other NextAuth routes (CSRF, session,
 * signout, providers) are passed through unchanged.
 */
import NextAuth from 'next-auth';
import type { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { guardCredentialsLogin } from '@/lib/auth-rate-limit';

const handler = NextAuth(authOptions);

export { handler as GET };

type RouteContext = { params: Promise<{ nextauth: string[] }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const limited = await guardCredentialsLogin(request);
  if (limited) {
    return limited;
  }

  return handler(request, context);
}
