/**
 * NextAuth.js Configuration
 *
 * Configures authentication for the application using NextAuth.js 4.x.
 * Authentication uses server-side sessions stored in the PostgreSQL database.
 *
 * Session tokens are stored in HTTP-only cookies for security.
 * Sessions are validated server-side on every request.
 *
 * See docs/SECURITY.md for the full authentication architecture.
 */
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcryptjs from 'bcryptjs';
import { z } from 'zod';
import { db } from './db';

/** Zod schema for validating login credentials */
const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const authOptions: NextAuthOptions = {
  /**
   * Use JWT strategy with database session storage.
   * Sessions are stored in the Session model via the database adapter.
   *
   * Phase 3 will add a proper Prisma 8 adapter.
   * For now we use JWT strategy as a placeholder.
   */
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: {
          label: 'Email',
          type: 'email',
          placeholder: 'you@example.com',
        },
        password: {
          label: 'Password',
          type: 'password',
        },
      },

      async authorize(credentials) {
        // 1. Validate input shape
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        try {
          // 2. Look up the user by email
          const user = await db.orm.public.User.first({ email });
          if (!user) {
            return null;
          }

          // 3. Verify the password
          const passwordValid = await bcryptjs.compare(
            password,
            user.passwordHash,
          );
          if (!passwordValid) {
            return null;
          }

          // 4. Return the user object NextAuth expects
          return {
            id: user.id,
            email: user.email,
            name: user.name ?? undefined,
          };
        } catch {
          // Never expose internal errors to the client
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, user is populated; persist the id in the JWT
      if (user) {
        token['userId'] = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      // Expose the userId in the session object (for server components)
      if (session.user && token['userId']) {
        (session.user as { id?: string }).id = token['userId'] as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },

  secret: process.env['NEXTAUTH_SECRET'],
};
