/**
 * WebRadio Authentication & Session Service
 *
 * Implements:
 *   - Cryptographic password hashing (bcryptjs, cost factor 12)
 *   - User registration with duplicate email detection
 *   - Server-side database session creation, validation & revocation
 *   - Role-Based Access Control (RBAC: USER, DEVELOPER, ADMIN)
 *   - Audit logging for security-relevant events
 *
 * Timestamps use Temporal.Instant because the Prisma 8 contract maps
 * `pg/timestamptz` to `pg/timestamptz-temporal@1`, whose runtime values are
 * Temporal.Instant — not JavaScript Date objects.
 *
 * Session tokens are stored as SHA-256 hashes, so a read-only database leak
 * does not hand out usable session credentials.
 */
import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from './db';
import type { AssignableRole, Role, RegisterInput } from './validations';

const BCRYPT_ROUNDS = 12;
const SESSION_MAX_AGE_DAYS = 30;

export const SELF_DEMOTION_CODE = 'SELF_DEMOTION_FORBIDDEN';
export const LAST_ADMIN_CODE = 'LAST_ADMIN';
export const LAST_SYSTEM_ADMIN_CODE = 'LAST_SYSTEM_ADMIN';

/**
 * A valid bcrypt hash used only to equalise timing when an email does not
 * exist. It does not correspond to any known account password.
 */
const TIMING_EQUALISATION_HASH =
  '$2b$12$DAMFNAm.WBFL/zH5HZWumeLRdpdsPz9rAX69/sJLRmuYalBo7tL9q';

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'AUTH_ERROR',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class DuplicateEmailError extends AuthError {
  constructor(email: string) {
    super(`A user with email "${email}" already exists.`, 409, 'EMAIL_EXISTS');
    this.name = 'DuplicateEmailError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    this.name = 'InvalidCredentialsError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = 'Insufficient permissions.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AuthError {
  constructor(message = 'Resource not found.') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Client-safe error description.
 *
 * Never returns database messages, SQL fragments or driver codes. Unknown
 * errors are reported as a generic server error.
 */
export function toPublicError(error: unknown): {
  status: number;
  body: { error: string; message: string };
} {
  if (error instanceof AuthError) {
    return {
      status: error.statusCode,
      body: { error: error.code, message: error.message },
    };
  }

  return {
    status: 500,
    body: {
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  };
}

/**
 * Guard for integration-test runs. Only loopback hosts and databases whose
 * name ends in `_test` are accepted, so a misconfigured TEST_DATABASE_URL can
 * never point the destructive test setup at a real database.
 */
export function ensureTestDatabase(url: string | undefined = process.env['DATABASE_URL']): void {
  if (!url) {
    throw new Error('Refusing to run: DATABASE_URL is not set.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusing to run: DATABASE_URL is not a valid connection URL.');
  }

  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run against non-local host "${parsed.hostname}". Only loopback databases are allowed.`,
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run against database "${databaseName}": the name must end in _test.`,
    );
  }
}

/**
 * Log only non-sensitive diagnostics for unexpected failures.
 */
export function logServerError(scope: string, error: unknown): void {
  if (error instanceof AuthError) {
    // Expected, client-facing error: no need to log internals.
    return;
  }

  const name = error instanceof Error ? error.name : 'UnknownError';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN';

  console.error(`[${scope}] unexpected failure`, { name, code });
}

/**
 * Hash a plain text password with bcryptjs (cost factor 12)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plain text password against a stored bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcryptjs.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random session token.
 * 32 bytes of CSPRNG output, base64url encoded (43 characters).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Session tokens are persisted as SHA-256 hashes only.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isExpired(expiresAt: Temporal.Instant): boolean {
  return Temporal.Instant.compare(expiresAt, Temporal.Now.instant()) <= 0;
}

/**
 * Register a new user in the database.
 *
 * The role is always USER. Registration input is never allowed to choose a
 * role; ADMIN is only reachable through the audited bootstrap / admin flow.
 */
export async function registerUser(
  data: RegisterInput,
  ipAddress?: string,
  userAgent?: string,
) {
  const email = data.email.toLowerCase().trim();

  // 1. Check if user already exists
  const existingUser = await db.orm.public.User.first({ email });
  if (existingUser) {
    throw new DuplicateEmailError(email);
  }

  // 2. Hash password securely
  const passwordHash = await hashPassword(data.password);

  // 3. Insert user into database with default role USER
  let user;
  try {
    user = await db.orm.public.User.create({
      email,
      passwordHash,
      name: data.name ?? null,
      role: 'USER',
    });
  } catch (error) {
    // Handle a race between the existence check and the insert. The unique
    // constraint is authoritative; report it as a duplicate, not a 500.
    const raced = await db.orm.public.User.first({ email });
    if (raced) {
      throw new DuplicateEmailError(email);
    }
    throw error;
  }

  // 4. Record audit log entry
  try {
    await db.orm.public.AuditLog.create({
      userId: user.id,
      action: 'USER_REGISTERED',
      details: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  } catch {
    // Non-critical: failure to log an audit event must not fail registration.
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    emailVerified: user.emailVerified,
  };
}

/**
 * Authenticate a user by email and password.
 */
export async function authenticateUser(
  emailInput: string,
  passwordInput: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const email = emailInput.toLowerCase().trim();

  // 1. Look up user by email
  const user = await db.orm.public.User.first({ email });

  if (!user) {
    // Equalise timing so a missing account is not distinguishable by latency.
    await verifyPassword(passwordInput, TIMING_EQUALISATION_HASH);
    throw new InvalidCredentialsError();
  }

  // 2. Verify password
  const isValid = await verifyPassword(passwordInput, user.passwordHash);
  if (!isValid) {
    throw new InvalidCredentialsError();
  }

  // 3. Audit successful login (never the password or hash)
  try {
    await db.orm.public.AuditLog.create({
      userId: user.id,
      action: 'USER_LOGIN',
      details: null,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    });
  } catch {
    // Non-critical
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    emailVerified: user.emailVerified,
  };
}

/**
 * Create a new server-side session in the database.
 *
 * Returns the raw token exactly once; only its SHA-256 hash is stored.
 */
export async function createDatabaseSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const token = generateSessionToken();
  const expiresAt = Temporal.Now.instant().add({ hours: 24 * SESSION_MAX_AGE_DAYS });

  const session = await db.orm.public.Session.create({
    userId,
    token: hashSessionToken(token),
    expiresAt,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  return {
    id: session.id,
    token,
    userId: session.userId,
    expiresAt: session.expiresAt,
  };
}

type SessionRow = {
  id: string;
  userId: string;
  expiresAt: Temporal.Instant;
};

/**
 * Load the user behind a still-valid session, or null when the session is
 * missing, expired or orphaned. Expired rows are removed opportunistically.
 */
async function resolveSession(session: SessionRow | null) {
  if (!session) {
    return null;
  }

  if (isExpired(session.expiresAt)) {
    try {
      await db.orm.public.Session.where({ id: session.id }).delete();
    } catch {
      // Ignore cleanup errors; the session is invalid regardless.
    }
    return null;
  }

  const user = await db.orm.public.User.first({ id: session.userId });
  if (!user) {
    return null;
  }

  return {
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      emailVerified: user.emailVerified,
    },
  };
}

/**
 * Validate an existing database session token.
 */
export async function validateDatabaseSession(token: string) {
  const session = await db.orm.public.Session.first({ token: hashSessionToken(token) });
  return resolveSession(session as SessionRow | null);
}

/**
 * Validate a session by its opaque row id. Used by the NextAuth glue: the
 * (encrypted, HttpOnly) JWT carries the session id, the database remains the
 * authority for expiry, revocation and the current role.
 */
export async function validateDatabaseSessionById(sessionId: string) {
  const session = await db.orm.public.Session.first({ id: sessionId });
  return resolveSession(session as SessionRow | null);
}

/**
 * Revoke (delete) a session from the database (logout).
 */
export async function revokeDatabaseSession(token: string) {
  const session = await db.orm.public.Session.first({ token: hashSessionToken(token) });
  if (session) {
    await db.orm.public.Session.where({ id: session.id }).delete();
    return true;
  }
  return false;
}

/**
 * Revoke a session by its row id.
 */
export async function revokeDatabaseSessionById(sessionId: string) {
  const session = await db.orm.public.Session.first({ id: sessionId });
  if (session) {
    await db.orm.public.Session.where({ id: session.id }).delete();
    return true;
  }
  return false;
}

/**
 * Role-Based Access Control helper functions.
 *
 * SYSTEM_ADMIN is the highest regular level and satisfies every check that
 * ADMIN satisfies. The rank is the single source of truth for hierarchy, so a
 * new role cannot accidentally become an admin-level role by string equality.
 */
const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  SYSTEM_ADMIN: 3,
};

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

export function assertRole(userRole: Role, requiredRole: Role): void {
  if (!hasRole(userRole, requiredRole)) {
    throw new ForbiddenError(
      `Access denied. Role "${requiredRole}" is required (current: "${userRole}").`,
    );
  }
}

/**
 * Change a user's role. Authorization is resolved from the database, so a
 * forged or stale client payload cannot grant ADMIN.
 *
 * The change and its audit log entry are committed atomically. The last
 * remaining administrator cannot be demoted.
 */
export async function changeUserRole(input: {
  actorId: string;
  targetUserId: string;
  newRole: AssignableRole;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ id: string; email: string; role: Role; previousRole: Role }> {
  return db.transaction(async (tx) => {
    // Every role change first locks all privileged accounts. This serialises
    // concurrent changes (including two administrators demoting each other)
    // and makes the last-SYSTEM_ADMIN count decision race-free. The actor is
    // always part of this set because no other role may change roles.
    const privileged = await tx.orm.public.User.where((user) =>
      or(user.role.eq('ADMIN'), user.role.eq('SYSTEM_ADMIN')),
    )
      .forNoKeyUpdate()
      .all();

    const actor = privileged.find((user) => user.id === input.actorId);
    if (!actor) {
      const exists = await tx.orm.public.User.first({ id: input.actorId });
      if (!exists) {
        throw new UnauthorizedError();
      }
      throw new ForbiddenError('Administrator privileges are required.');
    }

    if (actor.emailVerified === null) {
      throw new ForbiddenError(
        'Administrator actions require a verified e-mail address.',
      );
    }

    const target =
      privileged.find((user) => user.id === input.targetUserId) ??
      (await tx.orm.public.User.first({ id: input.targetUserId }));
    if (!target) {
      throw new NotFoundError('User not found.');
    }

    if (input.actorId === input.targetUserId && input.newRole !== actor.role) {
      throw new AuthError(
        actor.role === 'SYSTEM_ADMIN'
          ? 'Systemadministratoren können sich nicht selbst herabstufen. Ein anderer Systemadministrator muss die Änderung vornehmen.'
          : 'Administratoren können sich nicht selbst herabstufen. Ein anderer Administrator muss die Änderung vornehmen.',
        409,
        SELF_DEMOTION_CODE,
      );
    }

    // A normal ADMIN must never be able to touch a SYSTEM_ADMIN account.
    // There is no delete endpoint; this also blocks every role-based removal
    // of the highest privilege level.
    if (target.role === 'SYSTEM_ADMIN' && actor.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenError(
        'Nur ein Systemadministrator darf ein Systemadministrator-Konto ändern.',
      );
    }

    // Privileged roles are only granted to accounts that proved control of
    // their address. Without this, a mistyped address could receive admin
    // access, and a throw-away registration would be enough for DEVELOPER.
    if (input.newRole !== 'USER' && target.emailVerified === null) {
      throw new AuthError(
        'The target account must verify its e-mail address before receiving a privileged role.',
        409,
        'EMAIL_NOT_VERIFIED',
      );
    }

    const previousRole = target.role as Role;
    if (previousRole === input.newRole) {
      return {
        id: target.id,
        email: target.email,
        role: previousRole,
        previousRole,
      };
    }

    if (previousRole === 'SYSTEM_ADMIN') {
      const systemAdmins = privileged.filter(
        (user) => user.role === 'SYSTEM_ADMIN',
      );
      if (systemAdmins.length <= 1) {
        throw new AuthError(
          'Der letzte Systemadministrator kann nicht herabgestuft werden.',
          409,
          LAST_SYSTEM_ADMIN_CODE,
        );
      }
    }

    if (previousRole === 'ADMIN' && input.newRole !== 'ADMIN') {
      const admins = privileged.filter((user) => user.role === 'ADMIN');
      if (admins.length <= 1) {
        throw new AuthError(
          'The last administrator cannot be demoted.',
          409,
          LAST_ADMIN_CODE,
        );
      }
    }

    await tx.orm.public.User.where({ id: target.id }).update({ role: input.newRole });

    await tx.orm.public.AuditLog.create({
      userId: input.actorId,
      action: 'ADMIN_ROLE_CHANGED',
      details: JSON.stringify({
        targetUserId: target.id,
        actorRole: actor.role,
        previousRole,
        newRole: input.newRole,
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      id: target.id,
      email: target.email,
      role: input.newRole,
      previousRole,
    };
  });
}

/**
 * Number of administrators currently in the database.
 */
export async function countAdmins(): Promise<number> {
  const admins = await db.orm.public.User.where({ role: 'ADMIN' }).all();
  return admins.length;
}

/**
 * Number of SYSTEM_ADMIN accounts. Used by the bootstrap guard and tests.
 */
export async function countSystemAdmins(): Promise<number> {
  const admins = await db.orm.public.User.where({ role: 'SYSTEM_ADMIN' }).all();
  return admins.length;
}
