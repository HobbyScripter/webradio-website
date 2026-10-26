/**
 * @jest-environment node
 *
 * REAL PostgreSQL integration tests for the developer-access, suspension and
 * report flows.
 *
 * These run against the disposable `_test` database (`npm run test:integration`
 * refuses anything else) and use the real services, real transactions, real row
 * locks and real audit writes. Nothing is mocked.
 */
import { db } from '../db';
import {
  AccountSuspendedError,
  AuthError,
  ForbiddenError,
  authenticateUser,
  changeUserRole,
  createDatabaseSession,
  ensureTestDatabase,
  hashPassword,
  validateDatabaseSessionById,
} from '../auth-service';
import {
  decideDeveloperApplication,
  requestDeveloperAccess,
  withdrawDeveloperApplication,
} from '../developer-application-service';
import { liftSuspension, suspendAccount } from '../account-suspension';
import {
  dismissReport,
  listAccountWarnings,
  removeReportedContent,
  resolveReportTarget,
  submitReport,
  warnReportedAccount,
} from '../report-service';
import { submitCatalogEntry } from '../developer-catalog-service';
import { getPublishedPluginBySlug } from '../catalog';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'IntegrationPassword2026!';

const SLUG = `phase6-plugin-${RUN}`;

let adminId = '';
let systemAdminId = '';
let applicantId = '';
let reporterId = '';
let secondApplicantId = '';
let developerUserId = '';
let developerProfileId = '';
let pluginId = '';
let pluginVersionId = '';
let secondaryPluginId = '';
let draftPluginId = '';
let revokedSessionId = '';

async function createUser(input: {
  email: string;
  role: 'USER' | 'DEVELOPER' | 'ADMIN' | 'SYSTEM_ADMIN';
  verified: boolean;
  name?: string;
}): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await db.orm.public.User.create({
    email: input.email,
    passwordHash,
    name: input.name ?? null,
    role: input.role,
    emailVerified: input.verified ? Temporal.Now.instant() : null,
  });
  return user.id;
}

beforeAll(async () => {
  ensureTestDatabase();

  // Disposable `_test` database: start from a clean slate, exactly like the
  // existing integration suite does.
  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();

  adminId = await createUser({
    email: `phase6-admin_${RUN}@webradio.test`,
    role: 'ADMIN',
    verified: true,
    name: 'Admin',
  });
  systemAdminId = await createUser({
    email: `phase6-sysadmin_${RUN}@webradio.test`,
    role: 'SYSTEM_ADMIN',
    verified: true,
    name: 'System Admin',
  });
  applicantId = await createUser({
    email: `phase6-applicant_${RUN}@webradio.test`,
    role: 'USER',
    verified: false,
    name: 'Applicant',
  });
  reporterId = await createUser({
    email: `phase6-reporter_${RUN}@webradio.test`,
    role: 'USER',
    verified: false,
    name: 'Reporter',
  });
  secondApplicantId = await createUser({
    email: `phase6-applicant2_${RUN}@webradio.test`,
    role: 'USER',
    verified: false,
    name: 'Second Applicant',
  });
  developerUserId = await createUser({
    email: `phase6-developer_${RUN}@webradio.test`,
    role: 'DEVELOPER',
    verified: true,
    name: 'Developer',
  });

  const profile = await db.orm.public.DeveloperProfile.create({
    userId: developerUserId,
    displayName: 'Phase 6 Developer',
  });
  developerProfileId = profile.id;

  const plugin = await db.orm.public.Plugin.create({
    slug: SLUG,
    name: 'Phase 6 Plugin',
    description: 'A published plugin used by the phase 6 integration tests.',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: true,
  });
  pluginId = plugin.id;

  const version = await db.orm.public.PluginVersion.create({
    pluginId: plugin.id,
    version: '1.0.0',
    fileUrl: 'https://example.com/phase6-plugin.zip',
    fileSize: 1024,
    checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    isLatest: true,
  });
  pluginVersionId = version.id;

  // A second published entry stays available after the main plugin is removed,
  // so the warning flow can still file a report against public content.
  const secondary = await db.orm.public.Plugin.create({
    slug: `${SLUG}-second`,
    name: 'Phase 6 Plugin Zwei',
    description: 'A second published plugin used by the report tests.',
    developerId: profile.id,
    status: 'APPROVED',
    isPublished: true,
  });
  secondaryPluginId = secondary.id;

  // Never public: used to prove that reporter-facing resolution is filtered.
  const draft = await db.orm.public.Plugin.create({
    slug: `${SLUG}-draft`,
    name: 'Phase 6 Entwurf',
    description: 'An unpublished draft that reporters must not see.',
    developerId: profile.id,
    status: 'DRAFT',
    isPublished: false,
  });
  draftPluginId = draft.id;
});

describe('developer access applications', () => {
  it('rejects a motivation that is too short', async () => {
    await expect(
      requestDeveloperAccess({ userId: applicantId, motivation: 'zu kurz' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creates one open application and refuses a second one', async () => {
    const application = await requestDeveloperAccess({
      userId: applicantId,
      motivation: 'Ich möchte ein WebRadio-Plugin für Sender-Favoriten veröffentlichen.',
      portfolioUrl: 'https://example.com/portfolio',
    });

    expect(application.status).toBe('PENDING');

    await expect(
      requestDeveloperAccess({
        userId: applicantId,
        motivation: 'Zweiter Antrag mit ausreichend langer Begründung für den Test.',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_PENDING' });
  });

  it('lets a non-admin decide nothing', async () => {
    const pending = await db.orm.public.DeveloperApplication.first({
      userId: applicantId,
      status: 'PENDING',
    });

    await expect(
      decideDeveloperApplication({
        actorId: applicantId,
        applicationId: pending!.id,
        decision: 'APPROVED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets the applicant withdraw, then apply again', async () => {
    await withdrawDeveloperApplication({ userId: applicantId });

    const withdrawn = await db.orm.public.DeveloperApplication.where({
      userId: applicantId,
      status: 'WITHDRAWN',
    }).all();
    expect(withdrawn).toHaveLength(1);

    const second = await requestDeveloperAccess({
      userId: applicantId,
      motivation: 'Neuer Antrag nach Überarbeitung der Beschreibung für das Plugin.',
    });
    expect(second.status).toBe('PENDING');
  });

  it('grants DEVELOPER without a verified address and audits the exception', async () => {
    const pending = await db.orm.public.DeveloperApplication.first({
      userId: applicantId,
      status: 'PENDING',
    });

    const result = await decideDeveloperApplication({
      actorId: adminId,
      applicationId: pending!.id,
      decision: 'APPROVED',
      notes: 'Plugin-Idee passt zum Katalog.',
    });

    expect(result.grantedRole).toBe(true);

    const user = await db.orm.public.User.first({ id: applicantId });
    expect(user?.role).toBe('DEVELOPER');
    expect(user?.emailVerified).toBeNull();

    const audit = await db.orm.public.AuditLog.where({ userId: adminId }).all();
    const actions = audit.map((entry) => entry.action);
    expect(actions).toContain('ADMIN_ROLE_CHANGED');
    expect(actions).toContain('DEVELOPER_GRANTED_UNVERIFIED_EMAIL');
    expect(actions).toContain('DEVELOPER_APPLICATION_APPROVED');
  });

  it('refuses a second decision on the same application', async () => {
    const approved = await db.orm.public.DeveloperApplication.first({
      userId: applicantId,
      status: 'APPROVED',
    });

    await expect(
      decideDeveloperApplication({
        actorId: adminId,
        applicationId: approved!.id,
        decision: 'REJECTED',
        notes: 'Nachträgliche Ablehnung darf nicht möglich sein.',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_ALREADY_DECIDED' });
  });

  it('requires a reason for a rejection', async () => {
    const application = await requestDeveloperAccess({
      userId: secondApplicantId,
      motivation: 'Ich möchte ein Theme mit alternativem Senderraster veröffentlichen.',
    });

    await expect(
      decideDeveloperApplication({
        actorId: adminId,
        applicationId: application.id,
        decision: 'REJECTED',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      decideDeveloperApplication({
        actorId: adminId,
        applicationId: application.id,
        decision: 'REJECTED',
        notes: 'Bitte beschreibe die geplanten Funktionen konkreter.',
      }),
    ).resolves.toMatchObject({ status: 'REJECTED', grantedRole: false });
  });

  it('keeps ADMIN bound to the e-mail verification requirement', async () => {
    await expect(
      changeUserRole({
        actorId: adminId,
        targetUserId: secondApplicantId,
        newRole: 'ADMIN',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
});

describe('account suspensions', () => {
  it('revokes every session and blocks a fresh login', async () => {
    // A real session, as created by the NextAuth credentials provider.
    const session = await createDatabaseSession(reporterId);
    revokedSessionId = session.id;

    await suspendAccount({
      actorId: adminId,
      targetUserId: reporterId,
      reason: 'Wiederholte Spam-Meldungen gegen fremde Einträge.',
    });

    const sessions = await db.orm.public.Session.where({ userId: reporterId }).all();
    expect(sessions).toHaveLength(0);

    // The stale session id no longer resolves.
    await expect(validateDatabaseSessionById(session.id)).resolves.toBeNull();

    // Correct password is not enough while suspended.
    await expect(authenticateUser(`phase6-reporter_${RUN}@webradio.test`, PASSWORD)).rejects.toBeInstanceOf(
      AccountSuspendedError,
    );
  });

  it('refuses role changes for a suspended account', async () => {
    await expect(
      changeUserRole({
        actorId: adminId,
        targetUserId: reporterId,
        newRole: 'DEVELOPER',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('treats an expired temporary suspension as accessible again', async () => {
    // Simulate the passage of time by writing an end date in the past; the
    // status itself stays SUSPENDED (expiry is never written back).
    await db.orm.public.User.where({ id: reporterId }).update({
      suspendedUntil: Temporal.Now.instant().subtract({ minutes: 5 }),
    });

    const user = await db.orm.public.User.first({ id: reporterId });
    expect(user?.status).toBe('SUSPENDED');

    const fresh = await createDatabaseSession(reporterId);
    await expect(validateDatabaseSessionById(fresh.id)).resolves.not.toBeNull();

    await expect(
      authenticateUser(`phase6-reporter_${RUN}@webradio.test`, PASSWORD),
    ).resolves.toMatchObject({ id: reporterId });
  });

  it('does not let an expired timestamp lift a permanent suspension', async () => {
    await db.orm.public.User.where({ id: reporterId }).update({
      suspendedUntil: null,
    });

    await expect(
      authenticateUser(`phase6-reporter_${RUN}@webradio.test`, PASSWORD),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
  });

  it('lifts a suspension without reviving old sessions', async () => {
    await liftSuspension({
      actorId: adminId,
      targetUserId: reporterId,
      reason: 'Sachverhalt aufgeklärt, keine Regelverletzung festgestellt.',
    });

    const user = await db.orm.public.User.first({ id: reporterId });
    expect(user?.status).toBe('ACTIVE');
    expect(user?.suspendedUntil).toBeNull();
    expect(user?.suspendedReason).toBeNull();

    // The session revoked at suspension time must stay invalid forever; a lift
    // restores the account, never an old credential.
    await expect(validateDatabaseSessionById(revokedSessionId)).resolves.toBeNull();

    await expect(
      authenticateUser(`phase6-reporter_${RUN}@webradio.test`, PASSWORD),
    ).resolves.toMatchObject({ id: reporterId });

    const audit = await db.orm.public.AuditLog.where({ userId: adminId }).all();
    expect(audit.map((entry) => entry.action)).toContain('ACCOUNT_SUSPENSION_LIFTED');
  });

  it('forbids self-suspension', async () => {
    await expect(
      suspendAccount({
        actorId: adminId,
        targetUserId: adminId,
        reason: 'Selbstsperre darf nicht möglich sein, auch nicht versehentlich.',
      }),
    ).rejects.toMatchObject({ code: 'SELF_SUSPENSION_FORBIDDEN' });
  });

  it('forbids a normal ADMIN from suspending a SYSTEM_ADMIN', async () => {
    await expect(
      suspendAccount({
        actorId: adminId,
        targetUserId: systemAdminId,
        reason: 'Ein normaler Administrator darf Systemadministratoren nicht sperren.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requires a meaningful reason', async () => {
    await expect(
      suspendAccount({
        actorId: adminId,
        targetUserId: reporterId,
        reason: 'kurz',
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe('reports and takedowns', () => {
  it('resolves only publicly served entries for reporters', async () => {
    const published = await resolveReportTarget('PLUGIN', pluginId, { publicOnly: true });
    expect(published?.label).toBe('Plugin „Phase 6 Plugin“');

    const versionTarget = await resolveReportTarget('PLUGIN_VERSION', pluginVersionId, {
      publicOnly: true,
    });
    expect(versionTarget?.label).toBe('Plugin „Phase 6 Plugin“ – Version 1.0.0');

    // A draft is invisible to reporters but stays resolvable for moderation.
    await expect(
      resolveReportTarget('PLUGIN', draftPluginId, { publicOnly: true }),
    ).resolves.toBeNull();
    expect(await resolveReportTarget('PLUGIN', draftPluginId)).not.toBeNull();

    await expect(
      submitReport({
        reporterId: secondApplicantId,
        targetType: 'PLUGIN',
        targetId: draftPluginId,
        reason: 'SPAM',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses an unknown target', async () => {
    await expect(
      submitReport({
        reporterId,
        targetType: 'PLUGIN',
        targetId: 'does-not-exist',
        reason: 'SPAM',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('stores one report and refuses a duplicate', async () => {
    const report = await submitReport({
      reporterId,
      targetType: 'PLUGIN',
      targetId: pluginId,
      reason: 'MISLEADING',
      details: 'Die Beschreibung nennt Funktionen, die das Plugin nicht hat.',
    });
    expect(report.id).toBeTruthy();

    await expect(
      submitReport({
        reporterId,
        targetType: 'PLUGIN',
        targetId: pluginId,
        reason: 'SPAM',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_REPORT' });
  });

  it('does not change anything on its own and requires a reason to dismiss', async () => {
    const report = await db.orm.public.ContentReport.first({
      reporterId,
      targetId: pluginId,
    });

    await expect(
      dismissReport({ actorId: adminId, reportId: report!.id }),
    ).rejects.toMatchObject({ code: 'NOTES_REQUIRED' });

    const untouched = await db.orm.public.Plugin.first({ id: pluginId });
    expect(untouched?.status).toBe('APPROVED');
    expect(untouched?.isPublished).toBe(true);
  });

  it('forbids a non-admin from deciding a report', async () => {
    const report = await db.orm.public.ContentReport.first({
      reporterId,
      targetId: pluginId,
    });

    await expect(
      dismissReport({
        actorId: reporterId,
        reportId: report!.id,
        notes: 'Unberechtigte Entscheidung darf nicht durchgehen.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('removes published content, records the decision and hides it everywhere', async () => {
    const report = await db.orm.public.ContentReport.first({
      reporterId,
      targetId: pluginId,
    });

    await removeReportedContent({
      actorId: adminId,
      reportId: report!.id,
      notes: 'Beschreibung enthielt nachweislich falsche Angaben.',
    });

    const plugin = await db.orm.public.Plugin.first({ id: pluginId });
    expect(plugin?.status).toBe('REMOVED');
    expect(plugin?.isPublished).toBe(false);

    // Public catalogue query: gone.
    await expect(getPublishedPluginBySlug(SLUG)).resolves.toBeNull();

    // Terminal: the owner can not re-enter review.
    await expect(
      submitCatalogEntry({ actorId: developerUserId, kind: 'PLUGIN', entryId: pluginId }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });

    const updated = await db.orm.public.ContentReport.first({ id: report!.id });
    expect(updated?.status).toBe('CONTENT_REMOVED');
    expect(updated?.resolvedById).toBe(adminId);

    const review = await db.orm.public.PublicationReview.first({
      targetType: 'PLUGIN',
      targetId: pluginId,
      status: 'REMOVED',
    });
    expect(review).not.toBeNull();
    expect(review?.reviewerId).toBe(adminId);

    const audit = await db.orm.public.AuditLog.where({ userId: adminId }).all();
    expect(audit.map((entry) => entry.action)).toContain('CATALOG_ENTRY_REMOVED');
  });

  it('stops resolving removed content for new reports', async () => {
    await expect(
      resolveReportTarget('PLUGIN', pluginId, { publicOnly: true }),
    ).resolves.toBeNull();
    await expect(
      resolveReportTarget('PLUGIN_VERSION', pluginVersionId, { publicOnly: true }),
    ).resolves.toBeNull();

    // Moderation keeps access to the entry it has to act on.
    expect(await resolveReportTarget('PLUGIN', pluginId)).not.toBeNull();

    await expect(
      submitReport({
        reporterId: secondApplicantId,
        targetType: 'PLUGIN_VERSION',
        targetId: pluginVersionId,
        reason: 'MALWARE',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reports no warnings for an account without any', async () => {
    await expect(listAccountWarnings(applicantId)).resolves.toEqual([]);
  });

  it('records a warning in the audit log without claiming a delivery', async () => {
    const report = await submitReport({
      reporterId: secondApplicantId,
      targetType: 'PLUGIN',
      targetId: secondaryPluginId,
      reason: 'OTHER',
      details: 'Der Eintrag verweist auf eine inzwischen unbrauchbare Datei.',
    });

    await warnReportedAccount({
      actorId: adminId,
      reportId: report.id,
      notes: 'Verwarnung wegen wiederholt unklarer Angaben im Eintrag.',
    });

    const warning = await db.orm.public.AuditLog.first({
      userId: developerUserId,
      action: 'USER_WARNED',
    });
    expect(warning).not.toBeNull();
    expect(warning?.details).toContain('"emailSent":false');

    const closed = await db.orm.public.ContentReport.first({ id: report.id });
    expect(closed?.status).toBe('WARNING_ISSUED');
  });

  it('shows the warning reason to the warned account only', async () => {
    const warnings = await listAccountWarnings(developerUserId);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.reason).toBe(
      'Verwarnung wegen wiederholt unklarer Angaben im Eintrag.',
    );
    expect(Number.isNaN(new Date(warnings[0]!.issuedAt).getTime())).toBe(false);

    // No cross-account read: other accounts and unknown ids stay empty.
    await expect(listAccountWarnings(reporterId)).resolves.toEqual([]);
    await expect(listAccountWarnings('missing-user-id')).resolves.toEqual([]);
  });

  it('keeps the developer profile of the reported account intact', async () => {
    const profile = await db.orm.public.DeveloperProfile.first({ id: developerProfileId });
    expect(profile).not.toBeNull();
  });
});
