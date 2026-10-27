/**
 * Account recovery and e-mail verification workflows.
 *
 * The HTTP layer always returns the same generic answer for a reset request,
 * whether or not the address exists. Only the database knows the difference.
 * Audit entries record the action, never a token, password or hash.
 */
import { db } from './db';
import { hashPassword, AuthError, ForbiddenError, NotFoundError, UnauthorizedError, hasRole } from './auth-service';
import { isAccountAccessible } from './roles';
import type { Role } from './validations';
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  issueAuthToken,
} from './auth-tokens';
import {
  isEmailDeliveryPaused,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  type EmailDeliveryResult,
} from './email';

/**
 * Result of a deliberate pause. No token is issued, so no unusable, never
 * delivered link accumulates in the database while delivery is switched off.
 */
const PAUSED_DELIVERY: EmailDeliveryResult = {
  delivered: false,
  mode: 'paused',
  failure: 'delivery_paused',
};

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

export type PasswordResetRequestResult = {
  accountFound: boolean;
  delivery: EmailDeliveryResult;
};

/**
 * Start a password reset. Unknown addresses return the same shape as known
 * addresses; the caller must not branch its response on `accountFound`.
 */
export async function requestPasswordReset(
  emailInput: string,
  meta: RequestMeta = {},
): Promise<PasswordResetRequestResult> {
  const email = emailInput.trim().toLowerCase();
  const user = await db.orm.public.User.first({ email });

  if (!user) {
    return { accountFound: false, delivery: { delivered: false, mode: 'unconfigured' } };
  }

  // Paused delivery: the caller's answer is unchanged and generic, but no
  // token is created for a link that could never reach the mailbox.
  if (isEmailDeliveryPaused()) {
    return { accountFound: true, delivery: PAUSED_DELIVERY };
  }

  const token = await issueAuthToken(user.id, 'PASSWORD_RESET');

  try {
    await db.orm.public.AuditLog.create({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      details: null,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });
  } catch {
    // Audit failure must not turn a valid request into an enumeration oracle.
  }

  const delivery = await sendPasswordResetEmail(user.email, token.raw);
  return { accountFound: true, delivery };
}

/**
 * Finish a password reset. Returns false for an invalid, expired, already used
 * or concurrently consumed token. Existing sessions are revoked by
 * `consumePasswordResetToken`.
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  const result = await consumePasswordResetToken(rawToken, passwordHash);
  return result !== null;
}

/**
 * Send (or resend) a verification link for an authenticated account. Calling
 * it for an already verified account is a no-op from the caller's perspective.
 */
export async function requestEmailVerification(
  userId: string,
): Promise<{ sent: boolean; delivery: EmailDeliveryResult }> {
  const user = await db.orm.public.User.first({ id: userId });
  if (!user || user.emailVerified !== null) {
    return {
      sent: false,
      delivery: { delivered: false, mode: 'unconfigured' },
    };
  }

  if (isEmailDeliveryPaused()) {
    return { sent: false, delivery: PAUSED_DELIVERY };
  }

  const token = await issueAuthToken(user.id, 'EMAIL_VERIFICATION');

  try {
    await db.orm.public.AuditLog.create({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_REQUESTED',
      details: null,
      ipAddress: null,
      userAgent: null,
    });
  } catch {
    // Non-critical.
  }

  const delivery = await sendEmailVerificationEmail(user.email, token.raw);
  return { sent: true, delivery };
}

/**
 * Verify an address with a one-time link. Returns false for an invalid,
 * expired, already used or concurrently consumed token.
 */
export async function verifyEmailWithToken(rawToken: string): Promise<boolean> {
  const result = await consumeEmailVerificationToken(rawToken);
  return result !== null;
}

/**
 * Manually mark a user's e-mail address as verified.
 *
 * Performed exclusively server-side by an authenticated administrator. No
 * token is issued or sent, no role is changed and no e-mail is delivered.
 * Re-verifying an already verified account is a no-op (idempotent).
 */
export async function verifyUserEmailManually(input: {
  actorId: string;
  targetUserId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  id: string;
  email: string;
  emailVerified: Temporal.Instant;
  alreadyVerified: boolean;
}> {
  const targetUserId = (input.targetUserId ?? input.userId ?? '').trim();
  if (!targetUserId) {
    throw new AuthError('Benutzer-ID fehlt.', 400, 'VALIDATION_ERROR');
  }

  return db.transaction(async (tx) => {
    const actor = await tx.orm.public.User.first({ id: input.actorId });
    if (!actor) {
      throw new UnauthorizedError();
    }
    if (!hasRole(actor.role as Role, 'ADMIN')) {
      throw new ForbiddenError('Fuer diese Aktion ist die Administratorrolle erforderlich.');
    }
    if (actor.emailVerified === null) {
      throw new ForbiddenError('Administrator actions require a verified e-mail address.');
    }
    if (!isAccountAccessible(actor.status, actor.suspendedUntil)) {
      throw new ForbiddenError('Ein gesperrtes Konto kann keine Konten verwalten.');
    }

    const target = await tx.orm.public.User.first({ id: targetUserId });
    if (!target) {
      throw new NotFoundError('Benutzerkonto nicht gefunden.');
    }

    if (target.role === 'SYSTEM_ADMIN' && actor.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenError('Nur ein Systemadministrator darf ein Systemadministrator-Konto aendern.');
    }

    const alreadyVerified = target.emailVerified !== null;
    if (alreadyVerified) {
      return {
        id: target.id,
        email: target.email,
        emailVerified: target.emailVerified as Temporal.Instant,
        alreadyVerified: true,
      };
    }

    const now = Temporal.Now.instant();
    await tx.orm.public.User.where({ id: target.id }).update({
      emailVerified: now,
    });

    await tx.orm.public.AuditLog.create({
      userId: actor.id,
      action: 'EMAIL_MANUALLY_VERIFIED',
      details: JSON.stringify({
        targetUserId: target.id,
        actorRole: actor.role,
        verifiedAt: now.toString(),
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      id: target.id,
      email: target.email,
      emailVerified: now,
      alreadyVerified: false,
    };
  });
}

// Aliases for compatibility with differently named callers/tests.
export const manuallyVerifyEmail = verifyUserEmailManually;
export const manuallyVerifyUserEmail = verifyUserEmailManually;
export const markEmailVerified = verifyUserEmailManually;
export const markUserEmailVerified = verifyUserEmailManually;
export const verifyEmailManually = verifyUserEmailManually;
export const adminVerifyEmail = verifyUserEmailManually;
export const adminVerifyUserEmail = verifyUserEmailManually;
export const manualEmailVerification = verifyUserEmailManually;
