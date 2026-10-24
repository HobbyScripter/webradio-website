/**
 * Shared guards for admin JSON APIs.
 *
 * The Origin check runs before authorization, the session is resolved from the
 * database, and every mutation is rate limited per administrator account.
 */
import { NextResponse } from 'next/server';
import { requireAdminSession, type ServerAuthUser } from './server-auth';
import { errorResponse, isSameOriginRequest } from './api-response';
import { enforceRateLimits } from './rate-limit-http';
import type { RateLimitScope } from './rate-limit';

export function forbiddenCrossOrigin(): NextResponse {
  return NextResponse.json(
    { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function authorizeAdminMutation(
  request: Request,
  scope: RateLimitScope = 'contentWrite',
): Promise<{ user: ServerAuthUser } | { response: NextResponse }> {
  if (!isSameOriginRequest(request)) {
    return { response: forbiddenCrossOrigin() };
  }

  try {
    const user = await requireAdminSession();
    const limited = await enforceRateLimits([{ scope, identifier: user.id }]);
    if (limited) {
      return { response: limited };
    }
    return { user };
  } catch (error) {
    return { response: errorResponse('api:admin:mutation', error) };
  }
}
