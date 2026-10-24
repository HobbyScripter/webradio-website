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
