/**
 * One-time tokens for e-mail verification and password resets.
 *
 * The database stores only a SHA-256 digest. A raw token is returned to the
 * caller exactly once, placed in a link, and never persisted or logged.
 *
 * Consumption is transactional and locks the token row: two simultaneous
 * requests carrying the same link cannot both reset the password or verify the
 * address. `usedAt` is set in the same transaction as the effect.
 */
import crypto from 'crypto';
import { db } from './db';

export type AuthTokenKind = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export const PASSWORD_RESET_TTL_MINUTES = 60;
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

/** 32 bytes of CSPRNG output, base64url encoded (43 characters). */
export function generateAuthToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashAuthToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Raw token format accepted by the HTTP layer. */
export function isWellFormedAuthToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

type IssuedToken = {
  raw: string;
  expiresAt: Temporal.Instant;
};

/**
 * Issue a token and invalidate previous unused tokens of the same kind.
 * Returns the raw value once; only its digest is stored.
 */
export async function issueAuthToken(
  userId: string,
  type: AuthTokenKind,
): Promise<IssuedToken> {
  const raw = generateAuthToken();
  const now = Temporal.Now.instant();
  const expiresAt =
    type === 'PASSWORD_RESET'
      ? now.add({ minutes: PASSWORD_RESET_TTL_MINUTES })
      : now.add({ hours: EMAIL_VERIFICATION_TTL_HOURS });

  await db.transaction(async (tx) => {
    await tx.orm.public.AuthToken.where({
      userId,
      type,
      usedAt: null,
    }).updateAll({ usedAt: now });

    await tx.orm.public.AuthToken.create({
      userId,
      tokenHash: hashAuthToken(raw),
      type,
      expiresAt,
    });
  });

  return { raw, expiresAt };
}

type TokenRow = {
  id: string;
  userId: string;
  type: string;
  usedAt: Temporal.Instant | null;
  expiresAt: Temporal.Instant;
};

function isConsumable(row: TokenRow | null, type: AuthTokenKind): row is TokenRow {
  return Boolean(
    row &&
      row.type === type &&
      row.usedAt === null &&
      Temporal.Instant.compare(row.expiresAt, Temporal.Now.instant()) > 0,
  );
}

/**
 * Look up a valid token without consuming it. Used for a cheap pre-check
 * before the expensive bcrypt hash on password reset.
 */
export async function findValidAuthToken(
  rawToken: string,
  type: AuthTokenKind,
): Promise<TokenRow | null> {
  if (!isWellFormedAuthToken(rawToken)) {
    return null;
  }

  const row = await db.orm.public.AuthToken.first({
    tokenHash: hashAuthToken(rawToken),
    type,
  });

  return isConsumable(row as TokenRow | null, type) ? (row as TokenRow) : null;
}

/**
 * Consume an e-mail verification token and mark the user's address verified.
 * The token and the user update commit atomically.
 */
export async function consumeEmailVerificationToken(
  rawToken: string,
): Promise<{ userId: string } | null> {
  const candidate = await findValidAuthToken(rawToken, 'EMAIL_VERIFICATION');
  if (!candidate) {
    return null;
  }

  return db.transaction(async (tx) => {
    const locked = await tx.orm.public.AuthToken.where({
      id: candidate.id,
    }).forUpdate().first();

    if (!isConsumable(locked as TokenRow | null, 'EMAIL_VERIFICATION')) {
      return null;
    }

    const now = Temporal.Now.instant();
    await tx.orm.public.AuthToken.where({ id: candidate.id }).update({ usedAt: now });
    await tx.orm.public.User.where({ id: candidate.userId }).update({
      emailVerified: now,
    });

    await tx.orm.public.AuthToken.where({
      userId: candidate.userId,
      type: 'EMAIL_VERIFICATION',
      usedAt: null,
    }).updateAll({ usedAt: now });

    await tx.orm.public.AuditLog.create({
      userId: candidate.userId,
      action: 'EMAIL_VERIFIED',
      details: null,
      ipAddress: null,
      userAgent: null,
    });

    return { userId: candidate.userId };
  });
}

/**
 * Consume a password-reset token, replace the password hash and revoke every
 * existing database session for the account. All four writes are one
 * transaction: a reset can never leave old sessions alive.
 */
export async function consumePasswordResetToken(
  rawToken: string,
  passwordHash: string,
): Promise<{ userId: string } | null> {
  const candidate = await findValidAuthToken(rawToken, 'PASSWORD_RESET');
  if (!candidate) {
    return null;
  }

  return db.transaction(async (tx) => {
    const locked = await tx.orm.public.AuthToken.where({
      id: candidate.id,
    }).forUpdate().first();

    if (!isConsumable(locked as TokenRow | null, 'PASSWORD_RESET')) {
      return null;
    }

    const now = Temporal.Now.instant();
    await tx.orm.public.AuthToken.where({ id: candidate.id }).update({ usedAt: now });
    await tx.orm.public.User.where({ id: candidate.userId }).update({
      passwordHash,
    });
    await tx.orm.public.Session.where({ userId: candidate.userId }).deleteAll();

    await tx.orm.public.AuthToken.where({
      userId: candidate.userId,
      type: 'PASSWORD_RESET',
      usedAt: null,
    }).updateAll({ usedAt: now });

    await tx.orm.public.AuditLog.create({
      userId: candidate.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      details: null,
      ipAddress: null,
      userAgent: null,
    });

    return { userId: candidate.userId };
  });
}
