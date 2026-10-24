/**
 * HTTP glue for the durable rate limiter.
 *
 * All authentication endpoints call one of these helpers before doing any
 * password hashing or database work. A denied request returns HTTP 429 with a
 * generic message that never reveals whether an account exists.
 */
import { NextResponse } from 'next/server';
import {
  RATE_LIMITS,
  consumeRateLimitSafely,
  getClientIp,
  type RateLimitDecision,
  type RateLimitPolicy,
  type RateLimitScope,
} from './rate-limit';

const NO_STORE = 'no-store';

export function rateLimitResponse(decision: RateLimitDecision): NextResponse {
  return NextResponse.json(
    {
      error: 'RATE_LIMITED',
      message:
        'Zu viele Versuche. Bitte warte einen Moment und versuche es dann erneut.',
    },
    {
      status: 429,
      headers: {
        'Cache-Control': NO_STORE,
        'X-Content-Type-Options': 'nosniff',
        'Retry-After': String(decision.retryAfterSeconds),
        'RateLimit-Limit': String(decision.limit),
        'RateLimit-Remaining': '0',
        'RateLimit-Reset': String(Math.ceil(decision.resetAtMs / 1000)),
      },
    },
  );
}

export type RateLimitCheckInput = {
  scope: RateLimitScope;
  identifier: string;
  policy?: RateLimitPolicy;
};

/**
 * Apply one or more buckets. Every bucket is consumed; if any denies, the
 * strictest Retry-After wins. Passing an empty list is a no-op.
 */
export async function enforceRateLimits(
  checks: RateLimitCheckInput[],
): Promise<NextResponse | null> {
  if (checks.length === 0) {
    return null;
  }

  const decisions = await Promise.all(
    checks.map((check) =>
      consumeRateLimitSafely({
        scope: check.scope,
        identifier: check.identifier,
        policy: check.policy,
      }),
    ),
  );

  const denied = decisions.filter((decision) => !decision.allowed);
  if (denied.length === 0) {
    return null;
  }

  const strictest = denied.reduce((current, next) =>
    next.retryAfterSeconds > current.retryAfterSeconds ? next : current,
  );
  return rateLimitResponse(strictest);
}

/**
 * Convenience for request-level IP limits. When no trusted proxy is
 * configured, `getClientIp` returns null and this is intentionally skipped;
 * the caller must always add an account-level bucket.
 */
export async function enforceIpRateLimit(
  request: Request,
  scope: RateLimitScope,
): Promise<NextResponse | null> {
  const ip = getClientIp(request.headers);
  if (!ip) {
    return null;
  }

  return enforceRateLimits([{ scope, identifier: ip }]);
}

export function normalizedEmailIdentifier(email: string): string {
  return email.trim().toLowerCase();
}

export { RATE_LIMITS };
export type { RateLimitDecision, RateLimitPolicy, RateLimitScope };
