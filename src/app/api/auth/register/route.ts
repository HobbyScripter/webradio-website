import { NextResponse } from 'next/server';
import { registerSchema } from '@/lib/validations';
import { registerUser, DuplicateEmailError } from '@/lib/auth-service';
import { errorResponse, isSameOriginRequest } from '@/lib/api-response';

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
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

    const ipAddress = request.headers.get('x-forwarded-for') ?? undefined;
    const userAgent = request.headers.get('user-agent') ?? undefined;

    const user = await registerUser(result.data, ipAddress, userAgent);

    return NextResponse.json(
      {
        message: 'Registrierung erfolgreich',
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
