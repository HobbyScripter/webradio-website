import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * `CRON_SECRET` bearer authentication for machine-triggered endpoints.
 *
 * Deliberately tiny and dependency-free so every scheduler endpoint uses the
 * same rules:
 *
 * - no `CRON_SECRET` configured → `misconfigured` (fail closed, nothing runs),
 * - no `Authorization: Bearer …` header → `unauthorized`,
 * - wrong secret → `unauthorized`,
 * - only an exact match (constant-time) → `authorized`.
 *
 * Both sides are SHA-256 hashed before `timingSafeEqual`, so the comparison is
 * constant-time for every supplied length and an attacker can not learn the
 * secret's length from the response time. The secret itself is never logged,
 * returned or included in a response.
 */

export const CRON_SECRET_VARIABLE = 'CRON_SECRET';

export type CronAuthResult =
  | { status: 'authorized' }
  | { status: 'misconfigured' }
  | { status: 'unauthorized' };

/** Reads `CRON_SECRET`; blank or whitespace-only counts as not configured. */
export function readCronSecret(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[CRON_SECRET_VARIABLE];
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** Extracts the token from `Authorization: Bearer <token>`, if present. */
export function extractBearerToken(headers: Headers): string | null {
  const header = headers.get('authorization');
  if (!header) {
    return null;
  }

  const match = /^Bearer[ \t]+(\S.*)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time string comparison. Both inputs are hashed to a fixed 32 bytes
 * first, so unequal lengths do not throw and do not short-circuit.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** Verifies the `Authorization` header of a scheduler request. */
export function verifyCronRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): CronAuthResult {
  const expected = readCronSecret(env);
  if (expected === null) {
    return { status: 'misconfigured' };
  }

  const provided = extractBearerToken(request.headers);
  if (provided === null) {
    return { status: 'unauthorized' };
  }

  return timingSafeStringEqual(provided, expected)
    ? { status: 'authorized' }
    : { status: 'unauthorized' };
}
