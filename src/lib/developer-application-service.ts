/**
 * Developer access applications.
 *
 * A normal registration never grants DEVELOPER. A signed-in user may file one
 * application; an ADMIN or SYSTEM_ADMIN decides it. Approval runs through
 * `applyRoleChangeInTransaction()`, i.e. the same central role logic (locking,
 * last-admin guards, audit) as every other role change — there is no second
 * assignment path.
 *
 * "One open application per user" is enforced inside a transaction guarded by a
 * PostgreSQL advisory lock, because an empty result set locks no rows and two
 * concurrent submissions would otherwise both pass the existence check.
 */
import { db } from './db';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  applyRoleChangeInTransaction,
  lockPrivilegedUsers,
} from './auth-service';
import { hasRole, isAccountAccessible } from './roles';

export const DEVELOPER_APPLICATION_MIN_MOTIVATION = 50;
export const DEVELOPER_APPLICATION_MAX_MOTIVATION = 2000;
export const DEVELOPER_DECISION_MIN_NOTES = 10;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Separate advisory-lock namespace from the SYSTEM_ADMIN bootstrap lock. */
const DEVELOPER_APPLICATION_LOCK_NAMESPACE = 864201502;

function lockKey(tx: Transaction, subject: string) {
  return tx.execute(
    tx.raw
      .sql`SELECT pg_advisory_xact_lock(${DEVELOPER_APPLICATION_LOCK_NAMESPACE}, hashtext(${subject}))`
      .affectedCount()
      .build(),
  );
}

function normalizeMotivation(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length < DEVELOPER_APPLICATION_MIN_MOTIVATION ||
    trimmed.length > DEVELOPER_APPLICATION_MAX_MOTIVATION
  ) {
    throw new AuthError(
      `Die Begründung muss zwischen ${DEVELOPER_APPLICATION_MIN_MOTIVATION} und ${DEVELOPER_APPLICATION_MAX_MOTIVATION} Zeichen lang sein.`,
      400,
      'VALIDATION_ERROR',
    );
  }
  return trimmed;
}

function normalizeDecisionNotes(notes: string | undefined): string | null {
  const trimmed = notes?.trim() ?? '';
  if (trimmed.length > 0 && trimmed.length < DEVELOPER_DECISION_MIN_NOTES) {
    throw new AuthError(
      `Eine Begründung muss mindestens ${DEVELOPER_DECISION_MIN_NOTES} Zeichen lang sein.`,
      400,
      'VALIDATION_ERROR',
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

export type DeveloperApplicationRow = {
  id: string;
  userId: string;
  motivation: string;
  portfolioUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  decisionNotes: string | null;
  decidedById: string | null;
  decidedAt: Temporal.Instant | null;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
};

/**
 * File an application. Refuses when the account is already a developer, is
 * suspended, or already has an open application.
 */
export async function requestDeveloperAccess(input: {
  userId: string;
  motivation: string;
  portfolioUrl?: string | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<DeveloperApplicationRow> {
  const motivation = normalizeMotivation(input.motivation);

  return db.transaction(async (tx) => {
    // Serialises concurrent submissions of the same user.
    await lockKey(tx, `developer-application:${input.userId}`);

    const user = await tx.orm.public.User.first({ id: input.userId });
    if (!user) {
      throw new UnauthorizedError();
    }

    if (!isAccountAccessible(user.status, user.suspendedUntil)) {
      throw new AuthError(
        'Ein gesperrtes Konto kann keinen Entwicklerantrag stellen.',
        403,
        'ACCOUNT_SUSPENDED',
      );
    }

    if (hasRole(user.role, 'DEVELOPER')) {
      throw new AuthError(
        'Dieses Konto hat bereits Entwicklerrechte.',
        409,
        'ALREADY_DEVELOPER',
      );
    }

    const pending = await tx.orm.public.DeveloperApplication.first({
      userId: input.userId,
      status: 'PENDING',
    });
    if (pending) {
      throw new AuthError(
        'Es ist bereits ein offener Entwicklerantrag vorhanden.',
        409,
        'APPLICATION_PENDING',
      );
    }

    const application = await tx.orm.public.DeveloperApplication.create({
      userId: input.userId,
      motivation,
      portfolioUrl: input.portfolioUrl?.trim() || null,
      status: 'PENDING',
    });

    await tx.orm.public.AuditLog.create({
      userId: input.userId,
      action: 'DEVELOPER_APPLICATION_SUBMITTED',
      details: JSON.stringify({ applicationId: application.id }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return application as DeveloperApplicationRow;
  });
}

/** Withdraw the caller's own open application. */
export async function withdrawDeveloperApplication(input: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await lockKey(tx, `developer-application:${input.userId}`);

    const pending = await tx.orm.public.DeveloperApplication.first({
      userId: input.userId,
      status: 'PENDING',
    });
    if (!pending) {
      throw new NotFoundError('Kein offener Entwicklerantrag vorhanden.');
    }

    await tx.orm.public.DeveloperApplication.where({ id: pending.id }).update({
      status: 'WITHDRAWN',
      decidedAt: Temporal.Now.instant(),
    });

    await tx.orm.public.AuditLog.create({
      userId: input.userId,
      action: 'DEVELOPER_APPLICATION_WITHDRAWN',
      details: JSON.stringify({ applicationId: pending.id }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { id: pending.id };
  });
}

/** All applications of one user, newest first (own status view). */
export async function listOwnApplications(userId: string) {
  return db.orm.public.DeveloperApplication.where({ userId })
    .orderBy((application) => application.createdAt.desc())
    .all();
}

/** Admin queue: every application, optionally filtered by status. */
export async function listDeveloperApplications(status?: DeveloperApplicationRow['status']) {
  const where = status ? { status } : {};
  return db.orm.public.DeveloperApplication.where(where)
    .orderBy((application) => application.createdAt.desc())
    .all();
}

/**
 * Decide an application.
 *
 * REFUSED for anything but `PENDING`, which covers a second decision on the
 * same application (the classic double-submit) without ever re-granting a role.
 */
export async function decideDeveloperApplication(input: {
  actorId: string;
  applicationId: string;
  decision: 'APPROVED' | 'REJECTED';
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  applicationId: string;
  status: 'APPROVED' | 'REJECTED';
  grantedRole: boolean;
}> {
  const notes = normalizeDecisionNotes(input.notes);

  return db.transaction(async (tx) => {
    await lockKey(tx, `developer-application:${input.applicationId}`);

    // Same lock and role checks as every other privileged admin action.
    const privileged = await lockPrivilegedUsers(tx);
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

    const application = await tx.orm.public.DeveloperApplication.first({
      id: input.applicationId,
    });
    if (!application) {
      throw new NotFoundError('Antrag nicht gefunden.');
    }
    if (application.status !== 'PENDING') {
      throw new AuthError(
        'Dieser Antrag wurde bereits entschieden.',
        409,
        'APPLICATION_ALREADY_DECIDED',
      );
    }

    if (input.decision === 'REJECTED') {
      if (!notes) {
        throw new AuthError(
          'Eine Ablehnung erfordert eine Begründung.',
          400,
          'VALIDATION_ERROR',
        );
      }

      await tx.orm.public.DeveloperApplication.where({ id: application.id }).update({
        status: 'REJECTED',
        decisionNotes: notes,
        decidedById: actor.id,
        decidedAt: Temporal.Now.instant(),
      });

      await tx.orm.public.AuditLog.create({
        userId: actor.id,
        action: 'DEVELOPER_APPLICATION_REJECTED',
        details: JSON.stringify({
          applicationId: application.id,
          targetUserId: application.userId,
        }),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });

      return { applicationId: application.id, status: 'REJECTED', grantedRole: false };
    }

    // Approval: the role change runs in this transaction, so an application can
    // never be marked approved without the role actually being granted.
    await applyRoleChangeInTransaction(tx, {
      actorId: actor.id,
      targetUserId: application.userId,
      newRole: 'DEVELOPER',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await tx.orm.public.DeveloperApplication.where({ id: application.id }).update({
      status: 'APPROVED',
      decisionNotes: notes,
      decidedById: actor.id,
      decidedAt: Temporal.Now.instant(),
    });

    await tx.orm.public.AuditLog.create({
      userId: actor.id,
      action: 'DEVELOPER_APPLICATION_APPROVED',
      details: JSON.stringify({
        applicationId: application.id,
        targetUserId: application.userId,
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { applicationId: application.id, status: 'APPROVED', grantedRole: true };
  });
}
