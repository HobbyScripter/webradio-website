import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, AuthError, logServerError } from '@/lib/auth-service';

const profileSchema = z.object({
  name: z.string().max(100).nullable().optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().min(1),
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
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: parsed.error.message },
        { status: 400 },
      );
    }

    const { name, email, currentPassword } = parsed.data;

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

    // Check if email is being changed
    let newEmail = user.email;
    let emailChanged = false;
    
    if (email && email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
      // Check if new email is already in use
      const existingUser = await db.orm.public.User.first({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return NextResponse.json(
          { error: 'EMAIL_EXISTS', message: 'Email address is already in use' },
          { status: 409 },
        );
      }
      newEmail = email.toLowerCase().trim();
      emailChanged = true;
    }

    // Update user
    await db.orm.public.User.where({ id: session.user.id }).update({
      name: name ?? null,
      email: newEmail,
      emailVerified: emailChanged ? null : user.emailVerified, // Reset verification if email changed
    });

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: session.user.id,
        action: 'PROFILE_UPDATED',
        details: JSON.stringify({
          fieldsChanged: {
            name: name !== undefined && name !== user.name,
            email: emailChanged,
          },
        }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Profile updated successfully',
        emailChanged,
        emailVerified: !emailChanged && user.emailVerified !== null,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode },
      );
    }
    logServerError('api:account:profile', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
