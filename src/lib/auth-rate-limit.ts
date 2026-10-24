/**
 * Rate-limit gate for NextAuth's credentials callback.
 *
 * NextAuth's `authorize()` callback cannot set an HTTP status, so a limit hit
 * inside it would surface as a generic 401. This wrapper runs before NextAuth,
 * inspects a clone of the form body for the account identifier, and returns a
 * real 429. The original request body remains untouched for NextAuth.
 */
import type { NextResponse } from 'next/server';
import {
  enforceRateLimits,
  normalizedEmailIdentifier,
  type RateLimitCheckInput,
} from './rate-limit-http';
import { getClientIp } from './rate-limit';

async function readEmailFromBody(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';

  try {
    const body = await request.clone().text();
    if (!body) {
      return null;
    }

    if (contentType.includes('application/json')) {
      const parsed = JSON.parse(body) as { email?: unknown };
      return typeof parsed.email === 'string' ? parsed.email : null;
    }

    const params = new URLSearchParams(body);
    const email = params.get('email');
    return email && email.length <= 320 ? email : null;
  } catch {
    return null;
  }
}

/**
 * Returns a 429 response when the credentials callback should be refused, or
 * null when NextAuth may handle the request. Non-credentials routes are not
 * touched.
 */
export async function guardCredentialsLogin(
  request: Request,
): Promise<NextResponse | null> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.endsWith('/callback/credentials')) {
    return null;
  }

  const checks: RateLimitCheckInput[] = [];
  const ip = getClientIp(request.headers);
  if (ip) {
    checks.push({ scope: 'loginIp', identifier: ip });
  }

  const email = await readEmailFromBody(request);
  if (email) {
    checks.push({
      scope: 'loginAccount',
      identifier: normalizedEmailIdentifier(email),
    });
  }

  return enforceRateLimits(checks);
}
