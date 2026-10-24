import { NextResponse } from 'next/server';
import { registerSchema } from '@/lib/validations';
import {
  registerUser,
  DuplicateEmailError,
  logServerError,
} from '@/lib/auth-service';
import { errorResponse, isSameOriginRequest } from '@/lib/api-response';
import { requestEmailVerification } from '@/lib/account-service';
import { enforceIpRateLimit, enforceRateLimits } from '@/lib/rate-limit-http';
import { getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    const ipLimited = await enforceIpRateLimit(request, 'registerIp');
    if (ipLimited) {
      return ipLimited;
    }

    const json = await request.json();
    const result = registerSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validierungsfehler',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const accountLimited = await enforceRateLimits([
      { scope: 'registerAccount', identifier: result.data.email },
    ]);
    if (accountLimited) {
      return accountLimited;
    }

    const ipAddress = getClientIp(request.headers) ?? undefined;
    const userAgent = request.headers.get('user-agent') ?? undefined;

    const user = await registerUser(result.data, ipAddress, userAgent);

    // Verification is best-effort: a missing mail configuration must never
    // make registration fail or reveal whether an address is already in use.
    try {
      await requestEmailVerification(user.id);
    } catch (error) {
      logServerError('api:auth:register:verification', error);
    }

    return NextResponse.json(
      {
        message:
          'Registrierung erfolgreich. Dein Konto wurde erstellt; die E-Mail-Adresse ist noch nicht bestätigt.',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return NextResponse.json(
        {
          error: 'EMAIL_EXISTS',
          message: 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.',
        },
        { status: 409 },
      );
    }

    return errorResponse('api:auth:register', error);
  }
}
