/**
 * Account recovery and e-mail verification workflows.
 *
 * The HTTP layer always returns the same generic answer for a reset request,
 * whether or not the address exists. Only the database knows the difference.
 * Audit entries record the action, never a token, password or hash.
 */
import { db } from './db';
import { hashPassword } from './auth-service';
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  issueAuthToken,
} from './auth-tokens';
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  type EmailDeliveryResult,
} from './email';

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
