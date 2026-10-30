/**
 * Durable rate limiting for authentication endpoints.
 *
 * Why PostgreSQL instead of an in-process Map:
 *   - Vercel runs each request in a serverless function; a module-level counter
 *     is not shared between instances and is reset on every cold start.
 *   - The database is already a required dependency and is shared by every
 *     instance, so the limit is global without adding another paid service.
 *
 * Each bucket is one fixed window. The primary key is a SHA-256 digest of
 * `scope + normalized identifier + window start`, so neither an e-mail address
 * nor an IP address is stored in clear text. The increment is a single
 * `INSERT ... ON CONFLICT DO UPDATE` statement and therefore atomic.
 *
 * On a rate-limiter failure the caller may choose to fail open: authentication
 * itself still requires PostgreSQL, and a broken limiter must not become a
 * second outage. The failure is logged without identifiers.
 */
import crypto from 'crypto';
import { db } from './db';
import { describeErrorChain } from './db-error-diagnostics';

export type RateLimitPolicy = {
  /** Maximum number of requests in one window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Deliberately conservative limits. They are generous enough for a human
 * retrying a password, but stop trivial credential stuffing and mail flooding.
 */
export const RATE_LIMITS = {
  loginIp: { limit: 20, windowSeconds: 15 * 60 },
  loginAccount: { limit: 8, windowSeconds: 15 * 60 },
  registerIp: { limit: 5, windowSeconds: 60 * 60 },
  registerAccount: { limit: 3, windowSeconds: 60 * 60 },
  passwordResetRequestIp: { limit: 10, windowSeconds: 15 * 60 },
  passwordResetRequestAccount: { limit: 3, windowSeconds: 15 * 60 },
  authTokenIp: { limit: 20, windowSeconds: 15 * 60 },
  emailVerificationResend: { limit: 3, windowSeconds: 15 * 60 },
  // Authenticated content mutations. The identifier is the user id, so these
  // buckets are per account rather than per IP.
  contentWrite: { limit: 60, windowSeconds: 10 * 60 },
  moderationDecision: { limit: 60, windowSeconds: 10 * 60 },
  adminUserWrite: { limit: 30, windowSeconds: 10 * 60 },
  // Developer access requests: three per day, so a rejected applicant can ask
  // again after revising the motivation but can not flood the admin queue.
  developerApplication: { limit: 3, windowSeconds: 24 * 60 * 60 },
  // Read-only GitHub lookups from the developer form. The identifier is the
  // account, and the limit stays below GitHub's own unauthenticated quota so a
  // single developer can not exhaust it for everyone.
  githubLookup: { limit: 30, windowSeconds: 10 * 60 },
  // Abuse reports: ten per day per account. Both scopes are per account, never
  // per client-supplied identifier.
  reportCreate: { limit: 10, windowSeconds: 24 * 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitScope = keyof typeof RATE_LIMITS;

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  /** End of the current fixed window (epoch milliseconds). */
  resetAtMs: number;
};

export type RateLimitCheck = {
  scope: RateLimitScope;
  /** Normalized account identifier or IP. Never written to the database raw. */
  identifier: string;
  policy?: RateLimitPolicy;
  /** Injectable clock for deterministic tests. */
  nowMs?: number;
};

export function normalizeRateLimitIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase().slice(0, 320);
}

export function hashRateLimitKey(
  scope: string,
  identifier: string,
  windowStartMs: number,
): string {
  return crypto
    .createHash('sha256')
    .update(`${scope}\n${normalizeRateLimitIdentifier(identifier)}\n${windowStartMs}`)
    .digest('hex');
}

type BucketRow = { count: number };

/**
 * Atomically increment the current fixed-window bucket and return its count.
 *
 * The SQL is deliberately a single statement. A read-then-write transaction
 * would lose increments when two instances race on the same key.
 */
async function incrementBucket(
  key: string,
  windowStartMs: number,
  expiresAtMs: number,
): Promise<number> {
  const plan = db.raw
    .sql`
      INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt")
      VALUES (
        ${key},
        1,
        to_timestamp((${windowStartMs}::bigint)::double precision / 1000),
        to_timestamp((${expiresAtMs}::bigint)::double precision / 1000)
      )
      ON CONFLICT ("key") DO UPDATE
      SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"
    `
    .returnsRow({ count: 'pg/int4@1' })
    .build();

  const rows = (await db.query(plan)) as BucketRow[];
  const count = rows[0]?.count;
  if (typeof count !== 'number') {
    throw new Error('Rate-limit increment returned no count.');
  }
  return count;
}

/**
 * Consume one request from a bucket.
 *
 * Throws only for genuine infrastructure failures; callers at HTTP boundaries
 * catch those and fail open (see `consumeRateLimitSafely`).
 */
export async function consumeRateLimit(input: RateLimitCheck): Promise<RateLimitDecision> {
  const policy = input.policy ?? RATE_LIMITS[input.scope];
  const nowMs = input.nowMs ?? Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const resetAtMs = windowStartMs + windowMs;

  // Keep the row a little past the window so a cleanup job can remove it
  // without deleting a bucket that is still being incremented at the boundary.
  const expiresAtMs = resetAtMs + 60_000;
  const key = hashRateLimitKey(input.scope, input.identifier, windowStartMs);

  const count = await incrementBucket(key, windowStartMs, expiresAtMs);
  const remaining = Math.max(0, policy.limit - count);

  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
    resetAtMs,
  };
}

/**
 * Fail-open wrapper for HTTP handlers. A database outage means authentication
 * cannot succeed anyway; returning a 500 from the limiter would hide the real
 * error and add no security.
 */
export async function consumeRateLimitSafely(
  input: RateLimitCheck,
): Promise<RateLimitDecision> {
  try {
    return await consumeRateLimit(input);
  } catch (error) {
    // `describeErrorChain` also reports the driver code and SQLSTATE nested in
    // a Prisma wrapper (e.g. CONTRACT.MARKER_READ_FAILED → ECONNREFUSED).
    console.error(
      '[rate-limit] limiter unavailable; failing open',
      describeErrorChain(error),
    );

    const policy = input.policy ?? RATE_LIMITS[input.scope];
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      retryAfterSeconds: 1,
      resetAtMs: Date.now() + policy.windowSeconds * 1000,
    };
  }
}

/**
 * Extract a trustworthy client IP.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it.
 * On Vercel the platform sets it, so `VERCEL=1` enables parsing. A self-hosted
 * deployment must opt in explicitly with `TRUST_PROXY=1`. Without a trusted
 * proxy this returns null and the caller applies account-level limits only —
 * that is safer than using a spoofable header as a rate-limit key.
 */
export function getClientIp(headers: Headers): string | null {
  const trustProxy = process.env['TRUST_PROXY'] === '1' || process.env['VERCEL'] === '1';
  if (!trustProxy) {
    return null;
  }

  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) {
    return null;
  }

  const first = forwarded.split(',')[0]?.trim();
  if (!first) {
    return null;
  }

  // Basic sanity check: never use a header value larger than an IP literal.
  if (first.length > 64 || !/^[0-9a-fA-F.:[\]]+$/.test(first)) {
    return null;
  }

  return first;
}

/**
 * Remove expired buckets. Intended for a periodic job; the table is small and
 * correctness does not depend on the cleanup running.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const now = Temporal.Now.instant();
  const removed = await db.orm.public.RateLimitBucket.where((bucket) =>
    bucket.expiresAt.lt(now),
  ).deleteAll();
  return removed.length;
}
