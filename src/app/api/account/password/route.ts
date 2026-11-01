import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword, AuthError, logServerError } from '@/lib/auth-service';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import { passwordSchema } from '@/lib/validations';
import { validatePassword } from '@/lib/password-policy';
import { and, not } from '@prisma/orm-postgres/orm-client';

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Bitte gib dein aktuelles Passwort ein.'),
  newPassword: passwordSchema,
});

export async function PUT(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = changePasswordBodySchema.safeParse(body);
    if (!parsed.success) {
      const messages = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter((message): message is string => Boolean(message));
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: messages[0] ?? 'Bitte prüfe deine Eingaben.',
        },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const limited = await enforceRateLimits([
      { scope: 'passwordChange', identifier: session.user.id },
    ]);
    if (limited) {
      return limited;
    }

    const user = await db.orm.public.User.first({ id: session.user.id });
    if (!user) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'User not found' },
        { status: 404 },
      );
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        {
          error: 'INVALID_PASSWORD',
          message: 'Das aktuelle Passwort ist nicht korrekt.',
        },
        { status: 401 },
      );
    }

    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        {
          error: 'SAME_PASSWORD',
          message: 'Das neue Passwort muss sich vom bisherigen unterscheiden.',
        },
        { status: 400 },
      );
    }

    // Re-check here as well: the schema is the boundary, this keeps the policy
    // in force if a future caller bypasses it.
    const problems = validatePassword(newPassword);
    if (problems.length > 0) {
      return NextResponse.json(
        { error: 'WEAK_PASSWORD', message: problems[0] },
        { status: 400 },
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db.orm.public.User.where({ id: session.user.id }).update({
      passwordHash: newPasswordHash,
    });

    // Revoke every other session but keep the one that performed the change,
    // so the user is not silently logged out by their own password update.
    await db.orm.public.Session.where((s) =>
      and(s.userId.eq(session.user.id), not(s.id.eq(session.user.sessionId))),
    ).delete();

    try {
      await db.orm.public.AuditLog.create({
        userId: session.user.id,
        action: 'PASSWORD_CHANGED',
        details: null,
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      { success: true, message: 'Passwort geändert.' },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:account:password', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
