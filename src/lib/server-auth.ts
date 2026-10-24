/**
 * Server-Side Authentication & Authorization Helpers
 *
 * Use these helpers in Server Components, Server Actions, and Route Handlers.
 *
 * The NextAuth JWT is only transport: it carries the opaque database session
 * id. Every call here re-validates that session against PostgreSQL, so:
 *   - revoked sessions stop working immediately,
 *   - expired sessions are rejected and cleaned up,
 *   - the role used for authorization is the current database value (never a
 *     client-supplied field and never a stale token claim).
 */
import { getServerSession } from 'next-auth';
import { connection } from 'next/server';
import { authOptions } from './auth';
import {
  UnauthorizedError,
  ForbiddenError,
  hasRole,
  validateDatabaseSessionById,
} from './auth-service';
import type { Role } from './validations';

export type ServerAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  sessionId: string;
  emailVerified: Temporal.Instant | null;
};

export type ServerAuthSession = {
  user: ServerAuthUser;
  session: {
    id: string;
    expiresAt: Temporal.Instant;
  };
};

/**
 * Resolve the current session from the JWT cookie and the database.
 *
 * Returns null when there is no session or when the linked database session
 * is missing, expired or revoked.
 */
export async function getServerAuthSession(): Promise<ServerAuthSession | null> {
  // next-auth derives a CSRF token from crypto randomness on every session
  // read. That value is only valid at request time, so without this marker a
  // Cache Components prerender of an authenticated route fails with
  // "encountered the unstable value crypto.randomBytes while prerendering".
  await connection();

  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.sessionId) {
    return null;
  }

  const validated = await validateDatabaseSessionById(session.user.sessionId);
  if (!validated || validated.user.id !== session.user.id) {
    return null;
  }

  return {
    user: {
      id: validated.user.id,
      email: validated.user.email,
      name: validated.user.name,
      role: validated.user.role,
      sessionId: validated.session.id,
      emailVerified: validated.user.emailVerified,
    },
    session: validated.session,
  };
}

/**
 * Require any authenticated user with a live database session.
 */
export async function requireUserSession(): Promise<ServerAuthUser> {
  const session = await getServerAuthSession();
  if (!session) {
    throw new UnauthorizedError(
      'Sie müssen angemeldet sein, um auf diesen Bereich zuzugreifen.',
    );
  }
  return session.user;
}

/**
 * Require a specific minimum role, resolved from the database.
 */
export async function requireRoleSession(requiredRole: Role): Promise<ServerAuthUser> {
  const user = await requireUserSession();
  if (!hasRole(user.role, requiredRole)) {
    throw new ForbiddenError(
      `Zugriff verweigert. Die Rolle "${requiredRole}" ist erforderlich (aktuelle Rolle: "${user.role}").`,
    );
  }
  return user;
}

/**
 * Require Developer or Admin role
 */
export async function requireDeveloperSession(): Promise<ServerAuthUser> {
  return requireRoleSession('DEVELOPER');
}

/**
 * Require Admin role
 */
export async function requireAdminSession(): Promise<ServerAuthUser> {
  return requireRoleSession('ADMIN');
}
