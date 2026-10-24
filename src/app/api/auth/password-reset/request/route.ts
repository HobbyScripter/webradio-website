/**
 * POST /api/auth/password-reset/request
 *
 * Always answers with the same generic message, whether or not an account
 * exists. The response never contains a token. Rate limits apply by trusted IP
 * (when configured) and by normalized e-mail address.
 */
import { passwordResetRequestSchema } from '@/lib/validations';
import { requestPasswordReset } from '@/lib/account-service';
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { enforceIpRateLimit, enforceRateLimits } from '@/lib/rate-limit-http';
import { getClientIp } from '@/lib/rate-limit';

const GENERIC_MESSAGE =
  'Wenn ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen erstellt.';

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        403,
      );
    }

    const ipLimited = await enforceIpRateLimit(request, 'passwordResetRequestIp');
    if (ipLimited) {
      return ipLimited;
    }

    const json = await request.json().catch(() => null);
    const parsed = passwordResetRequestSchema.safeParse(json);
    if (!parsed.success) {
      return noStoreJson(
        {
          error: 'VALIDATION_ERROR',
          message: 'Bitte gib eine gültige E-Mail-Adresse an.',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const accountLimited = await enforceRateLimits([
      {
        scope: 'passwordResetRequestAccount',
        identifier: parsed.data.email,
      },
    ]);
    if (accountLimited) {
      return accountLimited;
    }

    await requestPasswordReset(parsed.data.email, {
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return noStoreJson({ message: GENERIC_MESSAGE });
  } catch (error) {
    return errorResponse('api:auth:password-reset:request', error);
  }
}
