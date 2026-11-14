import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/api-response';
import { enforceIpRateLimit } from '@/lib/rate-limit-http';
import { isBotUserAgent, isTrackingOptOut, trackPageView } from '@/lib/analytics/website';

/**
 * Anonymous page-view beacon.
 *
 * Privacy contract:
 * - no IP, cookie, user id or user agent is stored
 * - Do Not Track and Global Privacy Control skip counting entirely
 * - known bots and prefetches are not counted
 * - admin, auth, account and API paths are ignored
 *
 * The response is always an empty 204 so the beacon can never influence the
 * page; a tracking failure is not surfaced to the visitor.
 */
function noContent(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rateLimitResponse = await enforceIpRateLimit(request, 'pageViewIp');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (isTrackingOptOut(request.headers)) {
    return noContent();
  }
  if (isBotUserAgent(request.headers.get('user-agent'))) {
    return noContent();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noContent();
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return noContent();
  }

  const path = (body as Record<string, unknown>)['path'];
  const referrer = (body as Record<string, unknown>)['referrer'];
  if (typeof path !== 'string') {
    return noContent();
  }

  try {
    await trackPageView({
      path,
      referrer: typeof referrer === 'string' ? referrer : null,
      headers: request.headers,
    });
  } catch {
    // Analytics must never break navigation.
  }

  return noContent();
}
