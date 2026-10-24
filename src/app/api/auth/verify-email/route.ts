/**
 * POST /api/auth/verify-email
 *
 * Consumes a single-use verification token. The token proves control of the
 * address; no client-supplied user id or role is trusted.
 */
import { emailVerificationSchema } from '@/lib/validations';
import { verifyEmailWithToken } from '@/lib/account-service';
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
    const parsed = emailVerificationSchema.safeParse(json);
    if (!parsed.success) {
      return noStoreJson(
        {
          error: 'VALIDATION_ERROR',
          message: 'Der Bestätigungslink ist ungültig.',
        },
        400,
      );
    }

    const verified = await verifyEmailWithToken(parsed.data.token);
    if (!verified) {
      return noStoreJson(
        {
          error: 'INVALID_TOKEN',
          message: 'Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.',
        },
        400,
      );
    }

    return noStoreJson({
      message: 'E-Mail-Adresse bestätigt. Du kannst jetzt alle Funktionen nutzen.',
    });
  } catch (error) {
    return errorResponse('api:auth:verify-email', error);
  }
}
