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
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
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
  countSystemAdmins,
} from '../auth-service';
import {
  SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
  SYSTEM_ADMIN_RECOVERY_CONFIRM,
  recoverSystemAdmin,
} from '../system-admin';
import { db } from '../db';
import {
  cleanupExpiredRateLimits,
  consumeRateLimit,
  hashRateLimitKey,
} from '../rate-limit';
import {
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from '../account-service';
import {
  generateAuthToken,
  hashAuthToken,
  issueAuthToken,
} from '../auth-tokens';
import { getOutboxDirectory } from '../email';
import {
  getPublishedNewsBySlug,
  getPublishedPluginBySlug,
  getPublishedThemeBySlug,
  listPublishedNews,
  listPublishedPlugins,
  listPublishedThemes,
  listReleases,
  listRoadmapItems,
} from '../catalog';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_STARTED_AT = Date.now();
const USER_EMAIL = `user_${RUN}@webradio.test`;
const DEV_EMAIL = `dev_${RUN}@webradio.test`;
const ADMIN_EMAIL = `admin_${RUN}@webradio.test`;
const PASSWORD = 'IntegrationPassword2026!';

let regularUserId = '';
let developerId = '';
let adminId = '';

// Catalogue fixtures created in beforeAll and removed in afterAll.
let catalogProfileId = '';
let publishedPluginId = '';
let secondPluginId = '';
let publishedThemeId = '';
let releaseId = '';
let newsPastId = '';
let newsFutureId = '';
let newsDraftId = '';
let roadmapHighId = '';
let roadmapLowId = '';

const publishedPluginSlug = `alpha-${RUN}`;
const draftPluginSlug = `draft-${RUN}`;
const pendingPluginSlug = `pending-${RUN}`;
const rejectedPluginSlug = `rejected-${RUN}`;
const secondPluginSlug = `beta-${RUN}`;
const publishedThemeSlug = `night-${RUN}`;
const draftThemeSlug = `day-${RUN}`;

async function findOutboxToken(
  sinceMs: number,
  recipient: string,
  subjectFragment: string,
): Promise<string | null> {
  const dir = getOutboxDirectory();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }

  const matches: { mtimeMs: number; token: string }[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const info = await stat(full);
    if (info.mtimeMs < sinceMs) {
      continue;
    }

    const text = await readFile(full, 'utf8');
    if (!text.includes(`To: ${recipient}`) || !text.includes(subjectFragment)) {
      continue;
    }

    const token = text.match(/[?&]token=([A-Za-z0-9_-]{43})/)?.[1];
    if (token) {
      matches.push({ mtimeMs: info.mtimeMs, token });
    }
  }

  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.token ?? null;
}

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

function runSystemAdminBootstrap(
  env: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/system-admin-bootstrap.mts'], {
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
  // Transactional mail must never reach a real SMTP server from tests. With
  // these unset, the service writes to the local outbox instead.
  delete process.env['EMAIL_SERVER_HOST'];
  delete process.env['EMAIL_FROM'];
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

  const profile = await db.orm.public.DeveloperProfile.create({
    userId: developerId,
    displayName: `Catalog Studio ${RUN}`,
  });
  catalogProfileId = profile.id;

  const publishedPlugin = await db.orm.public.Plugin.create({
    slug: publishedPluginSlug,
    name: `Alpha Radio ${RUN}`,
    description: 'Streaming integration for the public catalogue',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: true,
    downloads: 12,
  });
  publishedPluginId = publishedPlugin.id;

  await db.orm.public.PluginVersion.create({
    pluginId: publishedPlugin.id,
    version: '1.2.0',
    description: 'Initial public version',
    fileUrl: 'https://example.com/alpha.zip',
    fileSize: 2048,
    checksum: 'checksum-alpha',
    isLatest: true,
  });
  await db.orm.public.PluginTag.create({ pluginId: publishedPlugin.id, tag: 'audio' });
  await db.orm.public.PluginScreenshot.create({
    pluginId: publishedPlugin.id,
    url: 'https://example.com/alpha.png',
    caption: 'Player',
    order: 1,
  });

  const secondPlugin = await db.orm.public.Plugin.create({
    slug: secondPluginSlug,
    name: `Beta Radio ${RUN}`,
    description: 'Second published plugin for pagination',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: true,
    downloads: 3,
  });
  secondPluginId = secondPlugin.id;

  await db.orm.public.Plugin.create({
    slug: draftPluginSlug,
    name: `Draft Radio ${RUN}`,
    description: 'Approved but not published',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: false,
  });

  await db.orm.public.Plugin.create({
    slug: pendingPluginSlug,
    name: `Pending Radio ${RUN}`,
    description: 'Published flag but pending review',
    developerId: profile.id,
    status: 'PENDING_REVIEW',
    isPublished: true,
  });

  await db.orm.public.Plugin.create({
    slug: rejectedPluginSlug,
    name: `Rejected Radio ${RUN}`,
    description: 'Rejected but published flag',
    developerId: profile.id,
    status: 'REJECTED',
    isPublished: true,
  });

  const publishedTheme = await db.orm.public.Theme.create({
    slug: publishedThemeSlug,
    name: `Night Theme ${RUN}`,
    description: 'Published theme',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: true,
    downloads: 5,
  });
  publishedThemeId = publishedTheme.id;
  await db.orm.public.ThemeVersion.create({
    themeId: publishedTheme.id,
    version: '2.0.0',
    fileUrl: 'https://example.com/night.zip',
    fileSize: 4096,
    checksum: 'checksum-theme',
    isLatest: true,
  });

  await db.orm.public.Theme.create({
    slug: draftThemeSlug,
    name: `Day Theme ${RUN}`,
    description: 'Approved theme without publication',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: false,
  });

  const release = await db.orm.public.Release.create({
    version: `0.9.0-integration.${RUN}`,
    title: `Integration release ${RUN}`,
    description: 'Release created by the integration test',
    downloadUrl: 'https://example.com/webradio.zip',
    fileSize: 1024,
    checksum: 'checksum-release',
  });
  releaseId = release.id;
  await db.orm.public.Changelog.create({
    releaseId: release.id,
    category: 'Added',
    text: 'Catalogue integration',
  });

  const pastNews = await db.orm.public.News.create({
    slug: `past-${RUN}`,
    title: `Past news ${RUN}`,
    summary: 'Visible',
    content: 'Visible content',
    isPublished: true,
    publishedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  newsPastId = pastNews.id;

  const futureNews = await db.orm.public.News.create({
    slug: `future-${RUN}`,
    title: `Future news ${RUN}`,
    summary: 'Scheduled',
    content: 'Scheduled content',
    isPublished: true,
    publishedAt: Temporal.Now.instant().add({ hours: 24 }),
  });
  newsFutureId = futureNews.id;

  const draftNews = await db.orm.public.News.create({
    slug: `draft-news-${RUN}`,
    title: `Draft news ${RUN}`,
    summary: 'Draft',
    content: 'Draft content',
    isPublished: false,
    publishedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  newsDraftId = draftNews.id;

  const highPriority = await db.orm.public.RoadmapItem.create({
    title: `High priority ${RUN}`,
    description: 'First',
    status: 'IN_PROGRESS',
    priority: 10,
  });
  roadmapHighId = highPriority.id;

  const lowPriority = await db.orm.public.RoadmapItem.create({
    title: `Low priority ${RUN}`,
    description: 'Second',
    status: 'PLANNED',
    priority: 1,
  });
  roadmapLowId = lowPriority.id;
});

afterAll(async () => {
  // Catalogue fixtures have no user relation for releases/news/roadmap, so
  // remove them explicitly before the users (which cascade to profiles).
  await db.orm.public.Changelog.where({ releaseId }).deleteAll();
  await db.orm.public.Release.where({ id: releaseId }).delete();
  await db.orm.public.News.where({ id: newsPastId }).delete();
  await db.orm.public.News.where({ id: newsFutureId }).delete();
  await db.orm.public.News.where({ id: newsDraftId }).delete();
  await db.orm.public.RoadmapItem.where({ id: roadmapHighId }).delete();
  await db.orm.public.RoadmapItem.where({ id: roadmapLowId }).delete();
  if (catalogProfileId) {
    await db.orm.public.DeveloperProfile.where({ id: catalogProfileId }).delete();
  }

  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.AuthToken.where({}).deleteAll();
  await db.orm.public.RateLimitBucket.where({}).deleteAll();
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();

  // Remove only outbox files created by this run.
  try {
    const dir = getOutboxDirectory();
    for (const file of await readdir(dir)) {
      const full = path.join(dir, file);
      const info = await stat(full);
      if (info.mtimeMs >= TEST_STARTED_AT) {
        await rm(full, { force: true });
      }
    }
  } catch {
    // The outbox may not exist if no message was generated.
  }

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

  it('refuses a privileged role before the target address is verified', async () => {
    const target = await db.orm.public.User.first({ id: regularUserId });
    expect(target?.emailVerified).toBeNull();

    await expect(
      changeUserRole({ actorId: adminId, targetUserId: regularUserId, newRole: 'DEVELOPER' }),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

    const unchanged = await db.orm.public.User.first({ id: regularUserId });
    expect(unchanged?.role).toBe('USER');

    // Simulate the successful verification flow before the role change below.
    await db.orm.public.User.where({ id: regularUserId }).update({
      emailVerified: Temporal.Now.instant(),
    });
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
      actorRole: 'ADMIN',
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

describe('5b. SYSTEM_ADMIN bootstrap, recovery and protection', () => {
  const SYSTEM_ADMIN_EMAIL = `sysadmin_${RUN}@webradio.test`;
  const SYSTEM_ADMIN_PASSWORD = 'SystemAdminIntegration2026!';
  let promotedId = '';
  let systemAdminId = '';
  let secondSystemAdminId = '';

  it('refuses the CLI without the explicit confirmation phrase', async () => {
    const result = await runSystemAdminBootstrap({
      SYSTEM_ADMIN_BOOTSTRAP_CONFIRM: '0',
      SYSTEM_ADMIN_EMAIL: SYSTEM_ADMIN_EMAIL,
      SYSTEM_ADMIN_PASSWORD: SYSTEM_ADMIN_PASSWORD,
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/Refusing to run/i);
    expect(await countSystemAdmins()).toBe(0);
  });

  it('promotes an existing, verified account through the CLI', async () => {
    const candidate = await registerUser({
      email: `promote_${RUN}@webradio.test`,
      password: SYSTEM_ADMIN_PASSWORD,
      confirmPassword: SYSTEM_ADMIN_PASSWORD,
    });
    promotedId = candidate.id;
    await db.orm.public.User.where({ id: promotedId }).update({
      emailVerified: Temporal.Now.instant(),
    });

    const result = await runSystemAdminBootstrap({
      SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
      SYSTEM_ADMIN_TARGET_ID: promotedId,
      SYSTEM_ADMIN_TARGET_EMAIL: candidate.email,
    });

    expect(result.code).toBe(0);
    const promoted = await db.orm.public.User.first({ id: promotedId });
    expect(promoted?.role).toBe('SYSTEM_ADMIN');

    const audit = await db.orm.public.AuditLog.where({
      userId: promotedId,
      action: 'SYSTEM_ADMIN_BOOTSTRAPPED',
    }).all();
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.details!)).toMatchObject({
      method: 'promoted-existing',
      previousRole: 'USER',
      promotedExistingUser: true,
    });

    // Reset the fixture to exercise the create path below; this is direct test
    // setup, not a supported application operation.
    await db.orm.public.User.where({ id: promotedId }).update({ role: 'USER' });
  });

  it('creates the first SYSTEM_ADMIN and refuses a second normal bootstrap', async () => {
    const created = await runSystemAdminBootstrap({
      SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
      SYSTEM_ADMIN_EMAIL,
      SYSTEM_ADMIN_PASSWORD,
      SYSTEM_ADMIN_NAME: 'System Operator',
    });

    expect(created.code).toBe(0);
    const systemAdmin = await db.orm.public.User.first({
      email: SYSTEM_ADMIN_EMAIL,
    });
    expect(systemAdmin?.role).toBe('SYSTEM_ADMIN');
    expect(systemAdmin?.emailVerified).not.toBeNull();
    expect(systemAdmin?.passwordHash).not.toBe(SYSTEM_ADMIN_PASSWORD);
    systemAdminId = systemAdmin!.id;

    const secondCreate = await runSystemAdminBootstrap({
      SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
      SYSTEM_ADMIN_EMAIL: `second_${RUN}@webradio.test`,
      SYSTEM_ADMIN_PASSWORD,
    });
    expect(secondCreate.code).not.toBe(0);
    expect(secondCreate.output).toMatch(/bereits ein Systemadministrator/i);

    const secondPromote = await runSystemAdminBootstrap({
      SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
      SYSTEM_ADMIN_TARGET_ID: promotedId,
      SYSTEM_ADMIN_TARGET_EMAIL: `promote_${RUN}@webradio.test`,
    });
    expect(secondPromote.code).not.toBe(0);
    expect(await countSystemAdmins()).toBe(1);
  });

  it('authenticates a SYSTEM_ADMIN and resolves the role from the database session', async () => {
    const user = await authenticateUser(SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD);
    expect(user.role).toBe('SYSTEM_ADMIN');

    const session = await createDatabaseSession(user.id, '127.0.0.1', 'jest');
    const validated = await validateDatabaseSession(session.token);
    expect(validated?.user.role).toBe('SYSTEM_ADMIN');
    expect(hasRole(validated!.user.role, 'ADMIN')).toBe(true);

    await revokeDatabaseSession(session.token);
    expect(await validateDatabaseSession(session.token)).toBeNull();
  });

  it('requires the recovery confirmation and only adds an account', async () => {
    const second = await registerUser({
      email: `recovery_${RUN}@webradio.test`,
      password: SYSTEM_ADMIN_PASSWORD,
      confirmPassword: SYSTEM_ADMIN_PASSWORD,
    });
    secondSystemAdminId = second.id;
    await db.orm.public.User.where({ id: secondSystemAdminId }).update({
      emailVerified: Temporal.Now.instant(),
    });

    await expect(
      recoverSystemAdmin({
        targetUserId: secondSystemAdminId,
        targetEmail: second.email,
        confirmation: 'WRONG',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIRMATION' });

    const recovered = await recoverSystemAdmin({
      targetUserId: secondSystemAdminId,
      targetEmail: second.email,
      confirmation: SYSTEM_ADMIN_RECOVERY_CONFIRM,
    });
    expect(recovered.alreadySystemAdmin).toBe(false);
    expect(await countSystemAdmins()).toBe(2);

    const audit = await db.orm.public.AuditLog.where({
      userId: secondSystemAdminId,
      action: 'SYSTEM_ADMIN_RECOVERED',
    }).all();
    expect(audit).toHaveLength(1);
  });

  it('blocks a normal ADMIN from touching a SYSTEM_ADMIN account', async () => {
    await expect(
      changeUserRole({
        actorId: adminId,
        targetUserId: systemAdminId,
        newRole: 'ADMIN',
      }),
    ).rejects.toThrow(ForbiddenError);

    const unchanged = await db.orm.public.User.first({ id: systemAdminId });
    expect(unchanged?.role).toBe('SYSTEM_ADMIN');
  });

  it('lets one SYSTEM_ADMIN demote another but protects the last one', async () => {
    const demoted = await changeUserRole({
      actorId: systemAdminId,
      targetUserId: secondSystemAdminId,
      newRole: 'ADMIN',
    });
    expect(demoted.previousRole).toBe('SYSTEM_ADMIN');
    expect(demoted.role).toBe('ADMIN');
    expect(await countSystemAdmins()).toBe(1);

    await expect(
      changeUserRole({
        actorId: systemAdminId,
        targetUserId: systemAdminId,
        newRole: 'ADMIN',
      }),
    ).rejects.toMatchObject({ code: SELF_DEMOTION_CODE });

    const remaining = await db.orm.public.User.first({ id: systemAdminId });
    expect(remaining?.role).toBe('SYSTEM_ADMIN');
    expect(await countSystemAdmins()).toBe(1);
  });

  it('serialises reciprocal role changes and never leaves zero SYSTEM_ADMINs', async () => {
    await recoverSystemAdmin({
      targetUserId: secondSystemAdminId,
      targetEmail: `recovery_${RUN}@webradio.test`,
      confirmation: SYSTEM_ADMIN_RECOVERY_CONFIRM,
    });
    expect(await countSystemAdmins()).toBe(2);

    const results = await Promise.allSettled([
      changeUserRole({
        actorId: systemAdminId,
        targetUserId: secondSystemAdminId,
        newRole: 'ADMIN',
      }),
      changeUserRole({
        actorId: secondSystemAdminId,
        targetUserId: systemAdminId,
        newRole: 'ADMIN',
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await countSystemAdmins()).toBe(1);
  });

  it('serialises two concurrent bootstraps so only one SYSTEM_ADMIN is created', async () => {
    // Test-fixture reset on the disposable database: remove the highest role
    // directly so the next bootstrap starts from zero SYSTEM_ADMINs. This is
    // not an application operation and never runs outside `_test`.
    await db.orm.public.User.where({ id: systemAdminId }).update({ role: 'ADMIN' });
    await db.orm.public.User.where({ id: secondSystemAdminId }).update({ role: 'ADMIN' });
    expect(await countSystemAdmins()).toBe(0);

    const results = await Promise.all([
      runSystemAdminBootstrap({
        SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
        SYSTEM_ADMIN_EMAIL: `concurrent_a_${RUN}@webradio.test`,
        SYSTEM_ADMIN_PASSWORD: SYSTEM_ADMIN_PASSWORD,
      }),
      runSystemAdminBootstrap({
        SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
        SYSTEM_ADMIN_EMAIL: `concurrent_b_${RUN}@webradio.test`,
        SYSTEM_ADMIN_PASSWORD: SYSTEM_ADMIN_PASSWORD,
      }),
    ]);

    const succeeded = results.filter((result) => result.code === 0);
    const refused = results.filter((result) => result.code !== 0);
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(await countSystemAdmins()).toBe(1);
  });

  it('never exposes SYSTEM_ADMIN as an assignable role', async () => {
    expect(hasRole('SYSTEM_ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'SYSTEM_ADMIN')).toBe(false);

    const schema = await import('../validations');
    expect(schema.assignableRoleSchema.safeParse('SYSTEM_ADMIN').success).toBe(false);
    expect(schema.roleSchema.safeParse('SYSTEM_ADMIN').success).toBe(true);
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

describe('8. Public catalogue filters (real PostgreSQL)', () => {
  it('lists only plugins that are both published and approved', async () => {
    const result = await listPublishedPlugins({
      q: `Radio ${RUN}`,
      sort: 'newest',
      page: 1,
      pageSize: 10,
    });
    const slugs = result.items.map((item) => item.slug);

    expect(slugs).toContain(publishedPluginSlug);
    expect(slugs).toContain(secondPluginSlug);
    expect(result.items.find((item) => item.slug === secondPluginSlug)?.id).toBe(secondPluginId);
    expect(slugs).not.toContain(draftPluginSlug);
    expect(slugs).not.toContain(pendingPluginSlug);
    expect(slugs).not.toContain(rejectedPluginSlug);

    const alpha = result.items.find((item) => item.slug === publishedPluginSlug);
    expect(alpha).toMatchObject({
      id: publishedPluginId,
      name: `Alpha Radio ${RUN}`,
      developerName: `Catalog Studio ${RUN}`,
      latestVersion: '1.2.0',
      tags: ['audio'],
      downloads: 12,
    });
  });

  it('filters by name/description and paginates without duplicates', async () => {
    const pageOne = await listPublishedPlugins({
      q: `Radio ${RUN}`,
      sort: 'name',
      page: 1,
      pageSize: 1,
    });
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.hasNext).toBe(true);

    const pageTwo = await listPublishedPlugins({
      q: `Radio ${RUN}`,
      sort: 'name',
      page: 2,
      pageSize: 1,
    });
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.hasNext).toBe(false);

    const allSlugs = [...pageOne.items, ...pageTwo.items].map((item) => item.slug);
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
  });

  it('returns only approved+published entries from the detail lookup', async () => {
    const published = await getPublishedPluginBySlug(publishedPluginSlug);
    expect(published?.id).toBe(publishedPluginId);
    expect(published?.versions[0]?.version).toBe('1.2.0');
    expect(published?.screenshots).toEqual([
      { url: 'https://example.com/alpha.png', caption: 'Player' },
    ]);

    expect(await getPublishedPluginBySlug(draftPluginSlug)).toBeNull();
    expect(await getPublishedPluginBySlug(pendingPluginSlug)).toBeNull();
    expect(await getPublishedPluginBySlug(rejectedPluginSlug)).toBeNull();
    expect(await getPublishedPluginBySlug(`missing-${RUN}`)).toBeNull();
  });

  it('binds catalogue and release rows to the WebRadio product', async () => {
    const plugin = await db.orm.public.Plugin.first({ id: publishedPluginId });
    const theme = await db.orm.public.Theme.first({ id: publishedThemeId });
    const release = await db.orm.public.Release.first({ id: releaseId });

    expect(plugin?.product).toBe('WEBRADIO');
    expect(theme?.product).toBe('WEBRADIO');
    expect(release?.product).toBe('WEBRADIO');

    // The database check constraint rejects any other product value, even if
    // a future endpoint forgot its validation.
    await expect(
      db.orm.public.Plugin.create({
        slug: `other-product-${RUN}`,
        name: 'Other product',
        description: 'Not a WebRadio plugin',
        developerId: catalogProfileId,
        product: 'OTHER' as never,
      }),
    ).rejects.toBeDefined();
  });

  it('applies the same publication rule to themes', async () => {
    const result = await listPublishedThemes({
      q: `Theme ${RUN}`,
      sort: 'downloads',
      page: 1,
      pageSize: 10,
    });

    expect(result.items.map((item) => item.slug)).toEqual([publishedThemeSlug]);
    expect(result.items[0]?.latestVersion).toBe('2.0.0');

    const published = await getPublishedThemeBySlug(publishedThemeSlug);
    expect(published?.id).toBe(publishedThemeId);
    expect(await getPublishedThemeBySlug(draftThemeSlug)).toBeNull();
  });

  it('returns release notes, download URL and beta channel from the database', async () => {
    const releases = await listReleases(50);
    const release = releases.find((entry) => entry.id === releaseId);

    expect(release).toBeDefined();
    expect(release?.version).toContain('integration');
    expect(release?.downloadUrl).toBe('https://example.com/webradio.zip');
    expect(release?.changelogs).toEqual([{ category: 'Added', text: 'Catalogue integration' }]);
  });

  it('hides unpublished and future-dated news', async () => {
    const entries = await listPublishedNews(50);
    const ids = entries.map((entry) => entry.id);

    expect(ids).toContain(newsPastId);
    expect(ids).not.toContain(newsFutureId);
    expect(ids).not.toContain(newsDraftId);

    expect(await getPublishedNewsBySlug(`past-${RUN}`)).not.toBeNull();
    expect(await getPublishedNewsBySlug(`future-${RUN}`)).toBeNull();
    expect(await getPublishedNewsBySlug(`draft-news-${RUN}`)).toBeNull();
  });

  it('orders roadmap items by priority from the database', async () => {
    const items = await listRoadmapItems();
    const highIndex = items.findIndex((item) => item.id === roadmapHighId);
    const lowIndex = items.findIndex((item) => item.id === roadmapLowId);

    expect(highIndex).toBeGreaterThanOrEqual(0);
    expect(lowIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeLessThan(lowIndex);
    expect(items[highIndex]?.status).toBe('IN_PROGRESS');
  });

  it('removes a withdrawn plugin from list and detail on the next query', async () => {
    const before = await listPublishedPlugins({
      q: `Radio ${RUN}`,
      sort: 'name',
      page: 1,
      pageSize: 10,
    });
    expect(before.items.map((item) => item.slug)).toContain(publishedPluginSlug);

    await db.orm.public.Plugin.where({ id: publishedPluginId }).update({
      isPublished: false,
    });

    const after = await listPublishedPlugins({
      q: `Radio ${RUN}`,
      sort: 'name',
      page: 1,
      pageSize: 10,
    });
    expect(after.items.map((item) => item.slug)).not.toContain(publishedPluginSlug);
    expect(await getPublishedPluginBySlug(publishedPluginSlug)).toBeNull();

    await db.orm.public.Plugin.where({ id: publishedPluginId }).update({
      isPublished: true,
    });
  });
});

describe('9. Durable rate limiting (real PostgreSQL)', () => {
  const scope = 'loginAccount' as const;
  const identifier = `Rate_${RUN}@WebRadio.test`;
  const base = Date.now();

  it('allows exactly the limit and rejects the next request', async () => {
    const policy = { limit: 2, windowSeconds: 60 };
    const first = await consumeRateLimit({ scope, identifier, policy, nowMs: base });
    const second = await consumeRateLimit({ scope, identifier, policy, nowMs: base });
    const third = await consumeRateLimit({ scope, identifier, policy, nowMs: base });

    expect(first).toMatchObject({ allowed: true, remaining: 1, limit: 2 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('increments atomically under concurrent requests', async () => {
    const policy = { limit: 5, windowSeconds: 60 };
    const now = base + 120_000;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        consumeRateLimit({ scope, identifier, policy, nowMs: now }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(5);
  });

  it('opens a new bucket after the fixed window', async () => {
    const policy = { limit: 1, windowSeconds: 60 };
    const now = base + 240_000;

    expect((await consumeRateLimit({ scope, identifier, policy, nowMs: now })).allowed).toBe(
      true,
    );
    expect((await consumeRateLimit({ scope, identifier, policy, nowMs: now })).allowed).toBe(
      false,
    );
    expect(
      (await consumeRateLimit({ scope, identifier, policy, nowMs: now + 60_000 })).allowed,
    ).toBe(true);
  });

  it('stores only a SHA-256 key, never the e-mail address', async () => {
    const windowMs = 60_000;
    const windowStart = Math.floor(base / windowMs) * windowMs;
    const key = hashRateLimitKey(scope, identifier, windowStart);
    const row = await db.orm.public.RateLimitBucket.first({ key });

    expect(row).not.toBeNull();
    expect(row?.key).toHaveLength(64);
    expect(row?.key).not.toContain('@');
    expect(row?.key).not.toContain('rate_');
    expect(row?.count).toBe(3);
  });

  it('removes expired buckets', async () => {
    const policy = { limit: 1, windowSeconds: 1 };
    await consumeRateLimit({
      scope,
      identifier: `expired_${RUN}`,
      policy,
      nowMs: base - 120_000,
    });

    const removed = await cleanupExpiredRateLimits();
    expect(removed).toBeGreaterThan(0);
  });
});

describe('10. Password reset and e-mail verification (real PostgreSQL)', () => {
  const resetEmail = `reset_${RUN}@webradio.test`;
  const verificationEmail = `verify_${RUN}@webradio.test`;
  const NEW_PASSWORD = 'NewIntegrationPassword2026!';
  let resetUserId = '';
  let verificationUserId = '';

  beforeAll(async () => {
    const resetUser = await registerUser({
      email: resetEmail,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
    resetUserId = resetUser.id;

    const verificationUser = await registerUser({
      email: verificationEmail,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
    verificationUserId = verificationUser.id;
  });

  it('answers an unknown reset request without creating a token', async () => {
    const result = await requestPasswordReset(`unknown_reset_${RUN}@webradio.test`);
    expect(result.accountFound).toBe(false);

    const tokens = await db.orm.public.AuthToken.where({
      type: 'PASSWORD_RESET',
    }).all();
    expect(tokens).toHaveLength(0);
  });

  it('stores only a token hash and resets the password exactly once', async () => {
    const session = await createDatabaseSession(resetUserId);
    const since = Date.now() - 2_000;

    const requested = await requestPasswordReset(resetEmail, {
      ipAddress: '127.0.0.1',
      userAgent: 'integration-test',
    });
    expect(requested.accountFound).toBe(true);

    const rawToken = await findOutboxToken(since, resetEmail, 'Passwort');
    expect(rawToken).not.toBeNull();

    const stored = await db.orm.public.AuthToken.where({
      userId: resetUserId,
      type: 'PASSWORD_RESET',
    }).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toHaveLength(64);
    expect(stored[0]?.tokenHash).not.toBe(rawToken);
    expect(stored[0]?.usedAt).toBeNull();

    await expect(resetPasswordWithToken(rawToken!, NEW_PASSWORD)).resolves.toBe(true);

    // Existing sessions are revoked and the old password no longer works.
    expect(await validateDatabaseSession(session.token)).toBeNull();
    expect(await db.orm.public.Session.where({ userId: resetUserId }).all()).toHaveLength(0);
    await expect(authenticateUser(resetEmail, PASSWORD)).rejects.toThrow(
      InvalidCredentialsError,
    );
    const updated = await authenticateUser(resetEmail, NEW_PASSWORD);
    expect(updated.id).toBe(resetUserId);

    // Single use: a second attempt with the same link fails.
    await expect(resetPasswordWithToken(rawToken!, 'AnotherPassword2026!')).resolves.toBe(
      false,
    );

    const audit = await db.orm.public.AuditLog.where({
      action: 'PASSWORD_RESET_COMPLETED',
    }).all();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.userId).toBe(resetUserId);
    expect(audit[0]?.details).toBeNull();
  });

  it('rejects an expired password-reset token', async () => {
    const rawToken = generateAuthToken();
    await db.orm.public.AuthToken.create({
      userId: verificationUserId,
      tokenHash: hashAuthToken(rawToken),
      type: 'PASSWORD_RESET',
      expiresAt: Temporal.Now.instant().subtract({ minutes: 1 }),
    });

    await expect(resetPasswordWithToken(rawToken, NEW_PASSWORD)).resolves.toBe(false);
  });

  it('verifies an e-mail address once and audits the event', async () => {
    const since = Date.now() - 2_000;
    const requested = await requestEmailVerification(verificationUserId);
    expect(requested.sent).toBe(true);

    const rawToken = await findOutboxToken(
      since,
      verificationEmail,
      'E-Mail-Adresse bestätigen',
    );
    expect(rawToken).not.toBeNull();

    await expect(verifyEmailWithToken(rawToken!)).resolves.toBe(true);

    const user = await db.orm.public.User.first({ id: verificationUserId });
    expect(user?.emailVerified).not.toBeNull();

    // Single use and no duplicate verification mail for a verified account.
    await expect(verifyEmailWithToken(rawToken!)).resolves.toBe(false);
    expect(await requestEmailVerification(verificationUserId)).toMatchObject({
      sent: false,
    });

    const audit = await db.orm.public.AuditLog.where({
      userId: verificationUserId,
      action: 'EMAIL_VERIFIED',
    }).all();
    expect(audit).toHaveLength(1);
  });

  it('issues tokens with a database-side hash and a bounded lifetime', async () => {
    const issued = await issueAuthToken(resetUserId, 'PASSWORD_RESET');
    expect(issued.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await db.orm.public.AuthToken.where({
      userId: resetUserId,
      type: 'PASSWORD_RESET',
      usedAt: null,
    }).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashAuthToken(issued.raw));

    const remainingSeconds = Number(
      (Temporal.Instant.compare(issued.expiresAt, Temporal.Now.instant()) > 0
        ? Temporal.Now.instant().until(issued.expiresAt).total('seconds')
        : 0) ?? 0,
    );
    expect(remainingSeconds).toBeGreaterThan(0);
    expect(remainingSeconds).toBeLessThanOrEqual(60 * 60 + 5);
  });
});
