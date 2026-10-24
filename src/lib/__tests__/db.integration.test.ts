/**
 * @jest-environment node
 *
 * REAL PostgreSQL integration tests.
 *
 * These run against a live, disposable database whose name ends in `_test`
 * (see `npm run test:integration`). Nothing is mocked: queries go through the
 * Prisma 8 runtime, the migration must already be applied, and the bootstrap
 * administrator is created through the real CLI script.
 */
import { spawn } from 'node:child_process';
import {
  registerUser,
  authenticateUser,
  createDatabaseSession,
  validateDatabaseSession,
  validateDatabaseSessionById,
  revokeDatabaseSession,
  revokeDatabaseSessionById,
  changeUserRole,
  hashSessionToken,
  hasRole,
  assertRole,
  toPublicError,
  ensureTestDatabase,
  DuplicateEmailError,
  InvalidCredentialsError,
  ForbiddenError,
  SELF_DEMOTION_CODE,
} from '../auth-service';
import { db } from '../db';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const USER_EMAIL = `user_${RUN}@webradio.test`;
const DEV_EMAIL = `dev_${RUN}@webradio.test`;
const ADMIN_EMAIL = `admin_${RUN}@webradio.test`;
const PASSWORD = 'IntegrationPassword2026!';

let regularUserId = '';
let developerId = '';
let adminId = '';

function runBootstrap(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/bootstrap-admin.mts'], {
      env: {
        ...process.env,
        DATABASE_URL: process.env['DATABASE_URL'],
        ...env,
      },
      cwd: process.cwd(),
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

beforeAll(async () => {
  ensureTestDatabase();
  // Disposable `_test` database: start from a clean slate.
  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();

  const bootstrap = await runBootstrap({
    ADMIN_BOOTSTRAP_CONFIRM: '1',
    BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    BOOTSTRAP_ADMIN_NAME: 'Bootstrap Admin',
  });

  if (bootstrap.code !== 0) {
    throw new Error(`Admin bootstrap failed:\n${bootstrap.output}`);
  }

  const admin = await db.orm.public.User.first({ email: ADMIN_EMAIL });
  if (!admin) {
    throw new Error('Bootstrap did not create an administrator');
  }
  adminId = admin.id;

  const user = await registerUser({
    email: USER_EMAIL.toUpperCase(), // normalization / case-insensitivity
    password: PASSWORD,
    confirmPassword: PASSWORD,
    name: 'Regular User',
  });
  regularUserId = user.id;

  const developer = await registerUser({
    email: DEV_EMAIL,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    name: 'Developer User',
  });
  developerId = developer.id;
  await db.orm.public.User.where({ id: developerId }).update({ role: 'DEVELOPER' });
});

afterAll(async () => {
  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();
  await db.close();
});

describe('0. Test database guard', () => {
  it('refuses to run against a database that is not a disposable _test database', async () => {
    expect(() => ensureTestDatabase('postgresql://postgres@127.0.0.1:5433/webradio_dev')).toThrow(
      /_test/,
    );
    expect(() => ensureTestDatabase('postgresql://postgres@db.example.com:5432/app_test')).toThrow(
      /non-local|loopback/i,
    );
    expect(() => ensureTestDatabase('not-a-url')).toThrow(/valid connection URL/);
  });
});

describe('1. Administrator bootstrap (CLI)', () => {
  it('created exactly one ADMIN with a hashed password and an audit entry', async () => {
    const admins = await db.orm.public.User.where({ role: 'ADMIN' }).all();
    expect(admins).toHaveLength(1);
    expect(admins[0]?.email).toBe(ADMIN_EMAIL);
    expect(admins[0]?.passwordHash.startsWith('$2')).toBe(true);
    expect(admins[0]?.passwordHash).not.toBe(PASSWORD);

    const audit = await db.orm.public.AuditLog.where({
      action: 'ADMIN_BOOTSTRAPPED',
    }).all();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.userId).toBe(adminId);
    expect(audit[0]?.userAgent).toBe('bootstrap-cli');
  });

  it('is disabled once an administrator exists', async () => {
    const second = await runBootstrap({
      ADMIN_BOOTSTRAP_CONFIRM: '1',
      BOOTSTRAP_ADMIN_EMAIL: `second_${RUN}@webradio.test`,
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    });

    expect(second.code).not.toBe(0);
    expect(second.output).toMatch(/already exist|Bootstrap disabled/i);

    const admins = await db.orm.public.User.where({ role: 'ADMIN' }).all();
    expect(admins).toHaveLength(1);
  });

  it('refuses to run without explicit confirmation and with a weak password', async () => {
    const noConfirm = await runBootstrap({
      ADMIN_BOOTSTRAP_CONFIRM: '0',
      BOOTSTRAP_ADMIN_EMAIL: `noconfirm_${RUN}@webradio.test`,
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    });
    expect(noConfirm.code).not.toBe(0);
    expect(noConfirm.output).toMatch(/Refusing to run/i);

    const weak = await runBootstrap({
      ADMIN_BOOTSTRAP_CONFIRM: '1',
      BOOTSTRAP_ADMIN_EMAIL: `weak_${RUN}@webradio.test`,
      BOOTSTRAP_ADMIN_PASSWORD: 'short',
    });
    expect(weak.code).not.toBe(0);
    expect(weak.output).toMatch(/at least 12 characters/i);
  });
});

describe('2. Registration and database reads', () => {
  it('persists a normalized email, UUIDv7 id, bcrypt hash and default role', async () => {
    const dbUser = await db.orm.public.User.first({ id: regularUserId });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.email).toBe(USER_EMAIL);
    expect(dbUser?.role).toBe('USER');
    expect(dbUser?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(dbUser?.passwordHash).not.toBe(PASSWORD);
    expect(dbUser?.passwordHash.startsWith('$2')).toBe(true);
    expect(dbUser?.createdAt.constructor.name).toBe('Instant');
  });

  it('rejects a duplicate email case-insensitively in the service layer', async () => {
    await expect(
      registerUser({
        email: USER_EMAIL.toUpperCase(),
        password: PASSWORD,
        confirmPassword: PASSWORD,
        name: 'Duplicate',
      }),
    ).rejects.toThrow(DuplicateEmailError);
  });

  it('enforces the unique email constraint in PostgreSQL itself', async () => {
    await expect(
      db.orm.public.User.create({
        email: USER_EMAIL,
        passwordHash: '$2b$12$notarealhashnotarealhashnotarealhashnotarealhash',
        role: 'USER',
      }),
    ).rejects.toBeDefined();
  });
});

describe('3. Password verification', () => {
  it('accepts the correct password and rejects a wrong one', async () => {
    const user = await authenticateUser(USER_EMAIL, PASSWORD);
    expect(user.id).toBe(regularUserId);

    await expect(authenticateUser(USER_EMAIL, 'WrongPassword2026!')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects unknown emails with the same public error as a wrong password', async () => {
    const unknown = await authenticateUser(`unknown_${RUN}@webradio.test`, PASSWORD).catch(
      (error: unknown) => error,
    );
    const wrong = await authenticateUser(USER_EMAIL, 'WrongPassword2026!').catch(
      (error: unknown) => error,
    );

    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect(wrong).toBeInstanceOf(InvalidCredentialsError);
    expect((unknown as Error).message).toBe((wrong as Error).message);
  });
});

describe('4. Database session lifecycle', () => {
  let sessionToken = '';
  let sessionId = '';

  it('creates a session with a 256-bit token and stores only its hash', async () => {
    const session = await createDatabaseSession(regularUserId, '127.0.0.1', 'jest');
    sessionToken = session.token;
    sessionId = session.id;

    expect(session.token).toHaveLength(43);
    expect(session.expiresAt.constructor.name).toBe('Instant');
    expect(Temporal.Instant.compare(session.expiresAt, Temporal.Now.instant())).toBeGreaterThan(0);

    const row = await db.orm.public.Session.first({ id: session.id });
    expect(row).not.toBeNull();
    expect(row?.token).toBe(hashSessionToken(session.token));
    expect(row?.token).not.toBe(session.token);
    expect(row?.ipAddress).toBe('127.0.0.1');
  });

  it('loads the session by token and by id, with the role from the database', async () => {
    const byToken = await validateDatabaseSession(sessionToken);
    expect(byToken?.user.id).toBe(regularUserId);
    expect(byToken?.user.role).toBe('USER');
    expect(byToken?.session.id).toBe(sessionId);

    const byId = await validateDatabaseSessionById(sessionId);
    expect(byId?.user.id).toBe(regularUserId);
  });

  it('rejects an expired session and deletes the row', async () => {
    const expired = await db.orm.public.Session.create({
      userId: regularUserId,
      token: hashSessionToken(`expired_${RUN}`),
      expiresAt: Temporal.Now.instant().subtract({ hours: 1 }),
      ipAddress: null,
      userAgent: 'expired-test',
    });

    const result = await validateDatabaseSession(`expired_${RUN}`);
    expect(result).toBeNull();
    expect(await db.orm.public.Session.first({ id: expired.id })).toBeNull();
  });

  it('revokes a session by token and by id', async () => {
    expect(await revokeDatabaseSession(sessionToken)).toBe(true);
    expect(await validateDatabaseSession(sessionToken)).toBeNull();

    const second = await createDatabaseSession(regularUserId);
    expect(await revokeDatabaseSessionById(second.id)).toBe(true);
    expect(await validateDatabaseSessionById(second.id)).toBeNull();

    // Revoking twice is a no-op, not an error.
    expect(await revokeDatabaseSessionById(second.id)).toBe(false);
  });

  it('drops all sessions when the user is deleted (cascade)', async () => {
    const temp = await registerUser({
      email: `cascade_${RUN}@webradio.test`,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
    await createDatabaseSession(temp.id);
    await db.orm.public.User.where({ id: temp.id }).delete();

    const remaining = await db.orm.public.Session.where({ userId: temp.id }).all();
    expect(remaining).toHaveLength(0);
  });
});

describe('5. Roles, permissions and admin actions', () => {
  it('reads roles from PostgreSQL, not from the token payload', async () => {
    const developer = await db.orm.public.User.first({ id: developerId });
    expect(developer?.role).toBe('DEVELOPER');

    const session = await createDatabaseSession(developerId);
    const validated = await validateDatabaseSession(session.token);
    expect(validated?.user.role).toBe('DEVELOPER');
    expect(hasRole(validated!.user.role, 'DEVELOPER')).toBe(true);
    expect(hasRole(validated!.user.role, 'ADMIN')).toBe(false);
    await revokeDatabaseSession(session.token);
  });

  it('prevents a regular USER from changing roles', async () => {
    await expect(
      changeUserRole({ actorId: regularUserId, targetUserId: developerId, newRole: 'ADMIN' }),
    ).rejects.toThrow(ForbiddenError);

    const target = await db.orm.public.User.first({ id: developerId });
    expect(target?.role).toBe('DEVELOPER');
  });

  it('prevents a DEVELOPER from changing roles', async () => {
    await expect(
      changeUserRole({ actorId: developerId, targetUserId: regularUserId, newRole: 'ADMIN' }),
    ).rejects.toThrow(ForbiddenError);

    const target = await db.orm.public.User.first({ id: regularUserId });
    expect(target?.role).toBe('USER');
  });

  it('lets an ADMIN change a role and records an audit log entry', async () => {
    const updated = await changeUserRole({
      actorId: adminId,
      targetUserId: regularUserId,
      newRole: 'DEVELOPER',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(updated.previousRole).toBe('USER');
    expect(updated.role).toBe('DEVELOPER');

    const row = await db.orm.public.User.first({ id: regularUserId });
    expect(row?.role).toBe('DEVELOPER');

    const audits = await db.orm.public.AuditLog.where({
      action: 'ADMIN_ROLE_CHANGED',
    }).all();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.userId).toBe(adminId);
    expect(JSON.parse(audits[0]!.details!)).toEqual({
      targetUserId: regularUserId,
      previousRole: 'USER',
      newRole: 'DEVELOPER',
    });
  });

  it('blocks self-demotion of an administrator', async () => {
    await expect(
      changeUserRole({ actorId: adminId, targetUserId: adminId, newRole: 'USER' }),
    ).rejects.toMatchObject({ code: SELF_DEMOTION_CODE });
  });

  it('authorization helpers refuse USER and DEVELOPER for ADMIN actions', async () => {
    expect(() => assertRole('USER', 'ADMIN')).toThrow(ForbiddenError);
    expect(() => assertRole('DEVELOPER', 'ADMIN')).toThrow(ForbiddenError);
    expect(() => assertRole('ADMIN', 'ADMIN')).not.toThrow();
  });
});

describe('6. Audit logging', () => {
  it('recorded registration and login events without secrets', async () => {
    await authenticateUser(DEV_EMAIL, PASSWORD);
    const logs = await db.orm.public.AuditLog.where({ userId: developerId }).all();
    const actions = logs.map((log) => log.action);

    expect(actions).toContain('USER_REGISTERED');
    expect(actions).toContain('USER_LOGIN');

    for (const log of logs) {
      expect(log.details ?? '').not.toMatch(/\$2[aby]\$/); // no bcrypt hash
      expect(log.details ?? '').not.toContain(PASSWORD);
    }
  });

  it('creates audit rows with Temporal.Instant timestamps', async () => {
    const log = await db.orm.public.AuditLog.where({ userId: developerId }).first();
    expect(log).not.toBeNull();
    expect(log?.createdAt.constructor.name).toBe('Instant');
  });
});

describe('7. Error handling', () => {
  it('maps unexpected database errors to a generic 500 without internals', () => {
    const driverError = new Error(
      'duplicate key value violates unique constraint "User_email_key" passwordHash=$2b$12$secret',
    );
    Object.assign(driverError, { code: 'P2010' });

    const publicError = toPublicError(driverError);
    expect(publicError.status).toBe(500);
    expect(JSON.stringify(publicError.body)).not.toMatch(/unique constraint|passwordHash|P2010/);
    expect(publicError.body.message).toBe('An unexpected error occurred.');
  });

  it('keeps AuthError status and code public', () => {
    const publicError = toPublicError(new InvalidCredentialsError());
    expect(publicError.status).toBe(401);
    expect(publicError.body.error).toBe('INVALID_CREDENTIALS');
  });
});
