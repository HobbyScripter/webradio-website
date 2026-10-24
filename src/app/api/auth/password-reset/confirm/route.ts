/**
 * POST /api/auth/password-reset/confirm
 *
 * Consumes a single-use token, replaces the bcrypt hash and revokes all
 * existing database sessions for the account. The token is never echoed back.
 */
import { passwordResetConfirmSchema } from '@/lib/validations';
import { resetPasswordWithToken } from '@/lib/account-service';
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { enforceIpRateLimit } from '@/lib/rate-limit-http';

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        403,
      );
    }

    const ipLimited = await enforceIpRateLimit(request, 'authTokenIp');
    if (ipLimited) {
      return ipLimited;
    }

    const json = await request.json().catch(() => null);
    const parsed = passwordResetConfirmSchema.safeParse(json);
    if (!parsed.success) {
      return noStoreJson(
        {
          error: 'VALIDATION_ERROR',
          message: 'Bitte prüfe die Eingaben.',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const changed = await resetPasswordWithToken(
      parsed.data.token,
      parsed.data.password,
    );

    if (!changed) {
      return noStoreJson(
        {
          error: 'INVALID_TOKEN',
          message: 'Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.',
        },
        400,
      );
    }

    return noStoreJson({
      message:
        'Passwort geändert. Alle bestehenden Sitzungen wurden beendet; bitte melde dich neu an.',
    });
  } catch (error) {
    return errorResponse('api:auth:password-reset:confirm', error);
  }
}
