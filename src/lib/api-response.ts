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

type JsonObjectResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/** Parse a JSON object body, rejecting arrays, scalars and invalid JSON. */
export async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'INVALID_JSON', message: 'Ungültiger JSON-Inhalt.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'INVALID_BODY', message: 'Es wird ein JSON-Objekt erwartet.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  }

  return { ok: true, body: body as Record<string, unknown> };
}

export function errorResponse(scope: string, error: unknown): NextResponse {
  logServerError(scope, error);

  const { status, body } = toPublicError(error);
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * A response that must never be stored by a browser, proxy or CDN. Used for
 * authentication, session and other personalized endpoints.
 */
export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
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
