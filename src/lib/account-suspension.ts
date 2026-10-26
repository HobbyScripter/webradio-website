/**
 * Account suspensions.
 *
 * A suspension is the only way to lock an account out. It must be effective
 * immediately, so:
 *
 *   - `status` and `suspendedUntil` are always written in the same UPDATE
 *     (a permanent suspension has no end date, a temporary one has exactly one),
 *   - every database session of the account is deleted in the same transaction,
 *   - `authenticateUser()` and `resolveSession()` both consult
 *     `isAccountAccessible()` from `roles.ts`, so neither a fresh login nor a
 *     stale cookie survives the change.
 *
 * Expiry is derived, never written: a temporary suspension that passed its end
 * simply stops matching, and nothing can turn a permanent suspension
 * (`suspendedUntil === null`) into an active account.
 */
import { db } from './db';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  lockPrivilegedUsers,
} from './auth-service';
import { isAccountAccessible } from './roles';

export const SUSPENSION_REASON_MIN_LENGTH = 10;
export const SUSPENSION_REASON_MAX_LENGTH = 500;

type SuspensionInput = {
  actorId: string;
  targetUserId: string;
  reason: string;
  /** `null`/omitted = permanent. A timestamp = temporary until that instant. */
  until?: Temporal.Instant | null;
  ipAddress?: string;
  userAgent?: string;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Admin resolution shared by suspend and lift: the actor is re-read from the
 * locked privileged set, so a forged or stale client payload can not act.
 */
async function resolveActingAdmin(tx: Transaction, actorId: string) {
  const privileged = await lockPrivilegedUsers(tx);
  const actor = privileged.find((user) => user.id === actorId);

  if (!actor) {
    const exists = await tx.orm.public.User.first({ id: actorId });
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

  if (!isAccountAccessible(actor.status, actor.suspendedUntil)) {
    throw new ForbiddenError('Ein gesperrtes Konto kann keine Konten verwalten.');
  }

  return { actor, privileged };
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  if (
    trimmed.length < SUSPENSION_REASON_MIN_LENGTH ||
    trimmed.length > SUSPENSION_REASON_MAX_LENGTH
  ) {
    throw new AuthError(
      `Die Begründung muss zwischen ${SUSPENSION_REASON_MIN_LENGTH} und ${SUSPENSION_REASON_MAX_LENGTH} Zeichen lang sein.`,
      400,
      'VALIDATION_ERROR',
    );
  }
  return trimmed;
}

/**
 * Suspend an account temporarily (`until`) or permanently (`until` omitted).
 *
 * Refuses: self-suspension, a lower-privileged admin suspending an admin or a
 * system administrator, and suspending the last ADMIN or last SYSTEM_ADMIN.
 * All checks run under the privileged row lock, so two concurrent requests can
 * not both pass them.
 */
export async function suspendAccount(input: SuspensionInput): Promise<{
  id: string;
  suspendedUntil: Temporal.Instant | null;
}> {
  const reason = normalizeReason(input.reason);

  return db.transaction(async (tx) => {
    const { actor, privileged } = await resolveActingAdmin(tx, input.actorId);

    if (input.actorId === input.targetUserId) {
      throw new AuthError(
        'Administratoren können sich nicht selbst sperren.',
        409,
        'SELF_SUSPENSION_FORBIDDEN',
      );
    }

    const target =
      privileged.find((user) => user.id === input.targetUserId) ??
      (await tx.orm.public.User.first({ id: input.targetUserId }));

    if (!target) {
      throw new NotFoundError('User not found.');
    }

    if (target.role === 'SYSTEM_ADMIN' && actor.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenError(
        'Nur ein Systemadministrator darf ein Systemadministrator-Konto sperren.',
      );
    }

    if (target.role === 'SYSTEM_ADMIN') {
      const systemAdmins = privileged.filter(
        (user) => user.role === 'SYSTEM_ADMIN',
      );
      if (systemAdmins.length <= 1) {
        throw new AuthError(
          'Der letzte Systemadministrator kann nicht gesperrt werden.',
          409,
          'LAST_SYSTEM_ADMIN',
        );
      }
    }

    if (target.role === 'ADMIN') {
      const admins = privileged.filter((user) => user.role === 'ADMIN');
      if (admins.length <= 1) {
        throw new AuthError(
          'Der letzte Administrator kann nicht gesperrt werden.',
          409,
          'LAST_ADMIN',
        );
      }
    }

    const suspendedUntil = input.until ?? null;

    // One statement for status + end date: a partial write could leave a
    // permanent suspension looking temporary or vice versa.
    await tx.orm.public.User.where({ id: target.id }).update({
      status: 'SUSPENDED',
      suspendedAt: Temporal.Now.instant(),
      suspendedUntil,
      suspendedReason: reason,
      suspendedById: actor.id,
    });

    // Immediate effect: no session of the account may stay usable.
    await tx.orm.public.Session.where({ userId: target.id }).deleteAll();

    await tx.orm.public.AuditLog.create({
      userId: actor.id,
      action: 'ACCOUNT_SUSPENDED',
      details: JSON.stringify({
        targetUserId: target.id,
        permanent: suspendedUntil === null,
        suspendedUntil: suspendedUntil ? suspendedUntil.toString() : null,
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { id: target.id, suspendedUntil };
  });
}

/**
 * Lift a suspension. Sessions revoked at suspension time are **not** restored:
 * the account has to sign in again, which is the point of the revocation.
 */
export async function liftSuspension(input: {
  actorId: string;
  targetUserId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ id: string }> {
  const reason = normalizeReason(input.reason);

  return db.transaction(async (tx) => {
    const { actor } = await resolveActingAdmin(tx, input.actorId);

    const target = await tx.orm.public.User.first({ id: input.targetUserId });
    if (!target) {
      throw new NotFoundError('User not found.');
    }

    if (target.role === 'SYSTEM_ADMIN' && actor.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenError(
        'Nur ein Systemadministrator darf ein Systemadministrator-Konto entsperren.',
      );
    }

    if (target.status !== 'SUSPENDED') {
      throw new AuthError(
        'Dieses Konto ist nicht gesperrt.',
        409,
        'NOT_SUSPENDED',
      );
    }

    // Status and end date together, so no stale end date survives.
    await tx.orm.public.User.where({ id: target.id }).update({
      status: 'ACTIVE',
      suspendedAt: null,
      suspendedUntil: null,
      suspendedReason: null,
      suspendedById: null,
    });

    await tx.orm.public.AuditLog.create({
      userId: actor.id,
      action: 'ACCOUNT_SUSPENSION_LIFTED',
      details: JSON.stringify({
        targetUserId: target.id,
        reason,
        previousSuspendedUntil: target.suspendedUntil
          ? target.suspendedUntil.toString()
          : null,
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { id: target.id };
  });
}
