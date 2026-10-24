/**
 * Shared API error handling.
 *
 * Errors that are safe to show (AuthError and its subclasses) keep their code
 * and message. Everything else becomes a generic 500, so SQL, driver and
 * constraint details never reach the client. Only the error type and code are
 * logged.
 */
import { NextResponse } from 'next/server';
import { logServerError, toPublicError } from './auth-service';

export function errorResponse(scope: string, error: unknown): NextResponse {
  logServerError(scope, error);

  const { status, body } = toPublicError(error);
  return NextResponse.json(body, { status });
}

/**
 * CSRF defense-in-depth for state-changing routes.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs in
 * current browsers. This additional check rejects a browser request whose
 * Origin does not match the app host (or NEXTAUTH_URL). Non-browser clients
 * such as curl send no Origin and are unaffected.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const host = request.headers.get('host');
  if (host && originUrl.host === host) {
    return true;
  }

  const configured = process.env['NEXTAUTH_URL'];
  if (configured) {
    try {
      return new URL(configured).origin === originUrl.origin;
    } catch {
      return false;
    }
  }

  return false;
}
