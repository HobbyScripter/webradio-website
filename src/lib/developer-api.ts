/**
 * Shared guards for developer JSON APIs.
 *
 * Every mutation checks the Origin header (CSRF defense-in-depth), resolves the
 * live database session and applies a per-account content-write rate limit
 * before touching the service layer.
 */
import { NextResponse } from 'next/server';
import { requireDeveloperSession, type ServerAuthUser } from './server-auth';
import { errorResponse, isSameOriginRequest } from './api-response';
import { enforceRateLimits } from './rate-limit-http';

// Kept as a re-export so existing developer routes import one module for guards.
export { readJsonObject } from './api-response';

export function forbiddenCrossOrigin(): NextResponse {
  return NextResponse.json(
    { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Resolve the developer for a mutation. Returns either the user or an error
 * response that the caller must return unchanged.
 */
export async function authorizeDeveloperMutation(
  request: Request,
): Promise<{ user: ServerAuthUser } | { response: NextResponse }> {
  if (!isSameOriginRequest(request)) {
    return { response: forbiddenCrossOrigin() };
  }

  try {
    const user = await requireDeveloperSession();
    const limited = await enforceRateLimits([
      { scope: 'contentWrite', identifier: user.id },
    ]);
    if (limited) {
      return { response: limited };
    }
    return { user };
  } catch (error) {
    return { response: errorResponse('api:developer:mutation', error) };
  }
}
