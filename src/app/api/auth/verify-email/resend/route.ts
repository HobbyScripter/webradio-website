/**
 * POST /api/auth/verify-email/resend
 *
 * Requires a live database session. The account is derived from the session,
 * never from the request body, so one user cannot trigger mail for another.
 */
import { requestEmailVerification } from '@/lib/account-service';
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { requireUserSession } from '@/lib/server-auth';
import { enforceIpRateLimit, enforceRateLimits } from '@/lib/rate-limit-http';

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        403,
      );
    }

    const ipLimited = await enforceIpRateLimit(request, 'emailVerificationResend');
    if (ipLimited) {
      return ipLimited;
    }

    const user = await requireUserSession();

    const accountLimited = await enforceRateLimits([
      {
        scope: 'emailVerificationResend',
        identifier: user.id,
      },
    ]);
    if (accountLimited) {
      return accountLimited;
    }

    if (user.emailVerified !== null) {
      return noStoreJson({
        message: 'Die E-Mail-Adresse ist bereits bestätigt.',
        alreadyVerified: true,
      });
    }

    await requestEmailVerification(user.id);

    return noStoreJson({
      message:
        'Falls die Zustellung konfiguriert ist, wurde ein neuer Bestätigungslink erstellt.',
    });
  } catch (error) {
    return errorResponse('api:auth:verify-email:resend', error);
  }
}
