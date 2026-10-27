/**
 * @jest-environment node
 */
import { db } from '../db';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  hashPassword,
  ensureTestDatabase,
} from '../auth-service';
import { verifyUserEmailManually } from '../account-service';

const RUN = `mev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'MevIntegration2026!';

let adminId = '';
let unverifiedAdminId = '';
let userId = '';
let systemAdminId = '';

async function createUser(role: 'USER' | 'ADMIN' | 'SYSTEM_ADMIN', verified: boolean, label: string) {
  const user = await db.orm.public.User.create({
    email: `${label}_${RUN}@webradio.test`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    emailVerified: verified ? Temporal.Now.instant() : null,
    name: label,
  });
  return user.id;
}

beforeAll(async () => {
  ensureTestDatabase();
  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();

  adminId = await createUser('ADMIN', true, 'admin');
  unverifiedAdminId = await createUser('ADMIN', false, 'unverifiedadmin');
  userId = await createUser('USER', false, 'user');
  systemAdminId = await createUser('SYSTEM_ADMIN', true, 'sysadmin');
  await db.orm.public.User.where({ id: systemAdminId }).update({ emailVerified: null });
});

afterAll(async () => {
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();
  await db.close();
});

describe('manual e-mail verification', () => {
  it('rejects unauthenticated/missing actor', async () => {
    await expect(
      verifyUserEmailManually({ actorId: 'does-not-exist', targetUserId: userId }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects a user without admin role', async () => {
    const actorId = await createUser('USER', true, 'plainuser');
    await expect(
      verifyUserEmailManually({ actorId, targetUserId: userId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an unverified administrator', async () => {
    await expect(
      verifyUserEmailManually({ actorId: unverifiedAdminId, targetUserId: userId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects invalid and missing user ids', async () => {
    await expect(
      verifyUserEmailManually({ actorId: adminId, targetUserId: 'not-a-real-id' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prevents a normal admin from verifying a system admin account', async () => {
    await expect(
      verifyUserEmailManually({ actorId: adminId, targetUserId: systemAdminId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('verifies an unverified user and writes exactly one audit entry', async () => {
    const beforeAudits = (await db.orm.public.AuditLog.where({ userId: adminId }).all()).length;
    const result = await verifyUserEmailManually({ actorId: adminId, targetUserId: userId });
    expect(result.alreadyVerified).toBe(false);

    const user = await db.orm.public.User.first({ id: userId });
    expect(user?.emailVerified).not.toBeNull();
    expect(user?.role).toBe('USER');

    const audits = await db.orm.public.AuditLog.where({ userId: adminId }).all();
    expect(audits.length - beforeAudits).toBe(1);
    expect(audits.map((a) => a.action)).toContain('EMAIL_MANUALLY_VERIFIED');
  });

  it('is idempotent on repeated verification without extra audit', async () => {
    const beforeAudits = (await db.orm.public.AuditLog.where({ userId: adminId }).all()).length;
    const result = await verifyUserEmailManually({ actorId: adminId, targetUserId: userId });
    expect(result.alreadyVerified).toBe(true);
    const afterAudits = (await db.orm.public.AuditLog.where({ userId: adminId }).all()).length;
    expect(afterAudits).toBe(beforeAudits);
  });
});