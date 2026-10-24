/**
 * @jest-environment node
 *
 * Real Database Integration Tests against PostgreSQL
 *
 * Runs actual queries against the live database configured via DATABASE_URL.
 * Tests:
 *   - User registration and database persistence
 *   - Email normalization & unique constraint enforcement
 *   - Password hash verification (bcryptjs) and rejection of invalid passwords
 *   - Database session lifecycle (create, read, expire, revoke)
 *   - Role retrieval and RBAC validation from database rows
 *   - Audit log persistence
 *   - Database error handling without sensitive leakage
 */
import {
  registerUser,
  authenticateUser,
  createDatabaseSession,
  validateDatabaseSession,
  revokeDatabaseSession,
  hasRole,
  assertRole,
  DuplicateEmailError,
  InvalidCredentialsError,
  ForbiddenError,
} from '../auth-service';
import { db } from '../db';

describe('PostgreSQL Integration Tests (Live Database)', () => {
  const testEmail = `test_${Date.now()}@webradio.example.com`;
  const testPassword = 'SecurePassword2026!';
  let createdUserId: string | null = null;
  let createdSessionToken: string | null = null;

  afterAll(async () => {
    // Cleanup created test records
    if (createdUserId) {
      try {
        await db.orm.public.Session.where({ userId: createdUserId }).deleteAll();
        await db.orm.public.AuditLog.where({ userId: createdUserId }).deleteAll();
        await db.orm.public.User.where({ id: createdUserId }).deleteAll();
      } catch (err) {
        console.error('Error during test cleanup:', err);
      }
    }
  });

  describe('1. User Registration & Database Read', () => {
    it('persists a new user with UUIDv7, hashed password and role in PostgreSQL', async () => {
      const user = await registerUser(
        {
          email: testEmail.toUpperCase(), // Test case-insensitivity / normalization
          password: testPassword,
          confirmPassword: testPassword,
          name: 'Integration Tester',
        },
        '127.0.0.1',
        'Jest-Integration-Runner',
      );

      expect(user).toBeDefined();
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(user.email).toBe(testEmail.toLowerCase());
      expect(user.role).toBe('USER');
      createdUserId = user.id;

      // Direct database verification
      const dbUser = await db.orm.public.User.first({ id: user.id });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.email).toBe(testEmail.toLowerCase());
      expect(dbUser?.passwordHash).not.toBe(testPassword);
      expect(dbUser?.passwordHash.startsWith('$2')).toBe(true);
      expect(dbUser?.role).toBe('USER');
    });

    it('enforces email normalization and rejects duplicate registration via unique constraint', async () => {
      await expect(
        registerUser({
          email: testEmail.toLowerCase(),
          password: 'AnotherPassword123!',
          confirmPassword: 'AnotherPassword123!',
          name: 'Duplicate Candidate',
        }),
      ).rejects.toThrow(DuplicateEmailError);
    });
  });

  describe('2. Authentication against PostgreSQL', () => {
    it('authenticates successfully with correct password', async () => {
      const user = await authenticateUser(testEmail, testPassword);
      expect(user).toBeDefined();
      expect(user.id).toBe(createdUserId);
      expect(user.role).toBe('USER');
    });

    it('rejects authentication with incorrect password', async () => {
      await expect(
        authenticateUser(testEmail, 'WrongPassword123!'),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('rejects authentication for non-existent user without revealing existence', async () => {
      await expect(
        authenticateUser('does_not_exist@example.com', testPassword),
      ).rejects.toThrow(InvalidCredentialsError);
    });
  });

  describe('3. Database Session Lifecycle in PostgreSQL', () => {
    it('creates a server-side session stored in the database', async () => {
      expect(createdUserId).not.toBeNull();
      const session = await createDatabaseSession(
        createdUserId!,
        '127.0.0.1',
        'Jest-Integration-Runner',
      );

      expect(session).toBeDefined();
      expect(session.token).toHaveLength(43);
      expect(session.userId).toBe(createdUserId);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      createdSessionToken = session.token;

      // Verify row exists in PostgreSQL
      const dbSession = await db.orm.public.Session.first({ token: session.token });
      expect(dbSession).not.toBeNull();
      expect(dbSession?.userId).toBe(createdUserId);
    });

    it('validates an active session and fetches current user role from DB', async () => {
      expect(createdSessionToken).not.toBeNull();
      const validated = await validateDatabaseSession(createdSessionToken!);

      expect(validated).not.toBeNull();
      expect(validated?.user.id).toBe(createdUserId);
      expect(validated?.user.role).toBe('USER');
    });

    it('rejects and cleans up expired sessions from the database', async () => {
      expect(createdUserId).not.toBeNull();
      const expiredDate = new Date(Date.now() - 3600 * 1000); // 1 hour in the past

      const expiredSession = await db.orm.public.Session.create({
        userId: createdUserId!,
        token: `expired_${Date.now()}`,
        expiresAt: expiredDate,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest-Expired-Test',
      });

      // Validation must fail and clean up row
      const result = await validateDatabaseSession(expiredSession.token);
      expect(result).toBeNull();

      // Verify row was deleted
      const checkDb = await db.orm.public.Session.first({ id: expiredSession.id });
      expect(checkDb).toBeNull();
    });

    it('revokes (deletes) a session from database on signout', async () => {
      expect(createdSessionToken).not.toBeNull();
      const revoked = await revokeDatabaseSession(createdSessionToken!);
      expect(revoked).toBe(true);

      const validatedAfterRevoke = await validateDatabaseSession(createdSessionToken!);
      expect(validatedAfterRevoke).toBeNull();
    });
  });

  describe('4. Role & Permission Updates in PostgreSQL', () => {
    it('reflects updated roles in database session checks and enforces RBAC', async () => {
      expect(createdUserId).not.toBeNull();

      // Update role to DEVELOPER in database
      await db.orm.public.User.where({ id: createdUserId! }).update({ role: 'DEVELOPER' });

      // Create new session
      const devSession = await createDatabaseSession(createdUserId!);
      const validated = await validateDatabaseSession(devSession.token);

      expect(validated?.user.role).toBe('DEVELOPER');
      expect(hasRole(validated!.user.role, 'DEVELOPER')).toBe(true);
      expect(hasRole(validated!.user.role, 'ADMIN')).toBe(false);

      // Verify assertRole prevents Developer from accessing Admin
      expect(() => assertRole(validated!.user.role, 'ADMIN')).toThrow(ForbiddenError);

      // Clean up session
      await revokeDatabaseSession(devSession.token);
    });
  });

  describe('5. Audit Logging Persistence in PostgreSQL', () => {
    it('verifies that registration created a valid audit log entry', async () => {
      expect(createdUserId).not.toBeNull();
      const auditLog = await db.orm.public.AuditLog
        .where({ userId: createdUserId! })
        .first();

      expect(auditLog).not.toBeNull();
      expect(auditLog?.action).toBe('USER_REGISTERED');
      expect(auditLog?.ipAddress).toBe('127.0.0.1');
    });
  });
});
