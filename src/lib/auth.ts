/**
 * NextAuth.js Configuration & Options
 *
 * NextAuth uses the JWT cookie as transport only. The authoritative session is
 * the row in the `Session` table:
 *
 *   1. `authorize()` verifies the password and creates a database session.
 *   2. The encrypted, HttpOnly NextAuth JWT stores that session's opaque id.
 *   3. Every server-side authorization check re-validates the id against the
 *      database (`src/lib/server-auth.ts`), so logout, expiry and role changes
 *      take effect immediately — no second, independent session system.
 *
 * The raw session token never leaves the server and only its SHA-256 hash is
 * persisted, so the database cannot be used to mint usable session credentials.
 */
import type { NextAuthOptions, DefaultSession } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';
import {
  authenticateUser,
  createDatabaseSession,
  revokeDatabaseSessionById,
  logServerError,
} from './auth-service';
import { getClientIp } from './rate-limit';
import type { Role } from './validations';

// Extend NextAuth types to include the role and the linked database session
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      sessionId: string;
      emailVerified: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: Role;
    sessionId?: string;
    emailVerified?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    userId?: string;
    role?: Role;
    sessionId?: string;
    emailVerified?: string | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const secret = process.env['NEXTAUTH_SECRET'];

if (!secret && process.env['NODE_ENV'] === 'production') {
  throw new Error(
    'NEXTAUTH_SECRET must be set in production. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
  );
}

/**
 * Production requires an explicit HTTPS origin. It drives the __Secure- cookie
 * prefix and every e-mail link, so inferring it from a request Host header
 * would allow host-header injection. Loopback is allowed for local
 * `next start` checks; a real deployment must use HTTPS.
 */
const configuredAuthUrl = process.env['NEXTAUTH_URL']?.trim();
if (process.env['NODE_ENV'] === 'production') {
  let valid = false;
  if (configuredAuthUrl) {
    try {
      const url = new URL(configuredAuthUrl);
      const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
      valid =
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && loopback.has(url.hostname));
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    throw new Error(
      'NEXTAUTH_URL must be set to the HTTPS production origin (loopback HTTP is allowed only for local checks).',
    );
  }
}

/**
 * NextAuth prefixes its cookies with `__Secure-` when the app is served over
 * HTTPS. Deriving this from NEXTAUTH_URL keeps the cookie name, the cookie
 * flags and the server-side cookie lookup in `server-auth.ts` in sync.
 */
const useSecureCookies = (configuredAuthUrl ?? '').startsWith('https://');

const sessionCookie = {
  name: `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: useSecureCookies,
  },
};

export const authOptions: NextAuthOptions = {
  secret,

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days, mirrors the database session
    updateAge: 24 * 60 * 60,
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },

  useSecureCookies,

  cookies: {
    sessionToken: sessionCookie,
    callbackUrl: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.callback-url`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? '__Host-' : ''}next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    pkceCodeVerifier: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        maxAge: 60 * 15,
      },
    },
    state: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        maxAge: 60 * 15,
      },
    },
    nonce: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.nonce`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
  },

  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        try {
          // Only a trusted proxy may supply the client IP. On Vercel the
          // platform sets x-forwarded-for; self-hosted deployments opt in
          // with TRUST_PROXY=1. Without that, audit IP is simply omitted.
          const headerBag = new Headers();
          for (const [key, value] of Object.entries(request?.headers ?? {})) {
            if (typeof value === 'string') {
              headerBag.set(key, value);
            }
          }
          const ipAddress = getClientIp(headerBag) ?? undefined;
          const userAgent = request?.headers?.['user-agent'];

          const user = await authenticateUser(parsed.data.email, parsed.data.password, {
            ipAddress,
            userAgent: typeof userAgent === 'string' ? userAgent : undefined,
          });

          const session = await createDatabaseSession(
            user.id,
            ipAddress,
            typeof userAgent === 'string' ? userAgent : undefined,
          );

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            sessionId: session.id,
            emailVerified: user.emailVerified ? user.emailVerified.toString() : null,
          };
        } catch (error) {
          // Invalid credentials are expected; real failures are logged without
          // any credentials or tokens.
          logServerError('next-auth:authorize', error);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.sessionId = user.sessionId;
        token.emailVerified = user.emailVerified ? String(user.emailVerified) : null;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.userId && token.sessionId) {
        session.user.id = token.userId;
        // Display hint only. Authorization always re-reads the role from the
        // database — see requireUserSession() in server-auth.ts.
        session.user.role = (token.role as Role) ?? 'USER';
        session.user.sessionId = token.sessionId;
        session.user.emailVerified = token.emailVerified
          ? String(token.emailVerified)
          : null;
      }
      return session;
    },
  },

  events: {
    async signOut(message) {
      const sessionId = 'token' in message ? message.token?.sessionId : undefined;
      if (sessionId) {
        try {
          await revokeDatabaseSessionById(sessionId);
        } catch (error) {
          logServerError('next-auth:signOut', error);
        }
      }
    },
  },

  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
};
