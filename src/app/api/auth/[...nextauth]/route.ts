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
 */
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
