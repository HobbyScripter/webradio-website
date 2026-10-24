import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword, AuthError, logServerError } from '@/lib/auth-service';
import { and, not } from '@prisma/orm-postgres/orm-client';

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
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
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: parsed.error.message },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    // Get current user
    const user = await db.orm.public.User.first({ id: session.user.id });
    if (!user) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'User not found' },
        { status: 404 },
      );
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
        { status: 401 },
      );
    }

    // Check if new password is different
    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'SAME_PASSWORD', message: 'New password must be different from current password' },
        { status: 400 },
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update user password
    await db.orm.public.User.where({ id: session.user.id }).update({
      passwordHash: newPasswordHash,
    });

    // Revoke every other session but keep the one that performed the change,
    // so the user is not silently logged out by their own password update.
    await db.orm.public.Session.where((s) =>
      and(s.userId.eq(session.user.id), not(s.id.eq(session.user.sessionId))),
    ).delete();

    // Create audit log
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
      { success: true, message: 'Password changed successfully' },
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
