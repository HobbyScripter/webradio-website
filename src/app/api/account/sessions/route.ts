import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { and, not } from '@prisma/orm-postgres/orm-client';
import { hashSessionToken, logServerError } from '@/lib/auth-service';

// GET all sessions for current user
export async function GET() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const currentSessionId = session.session.id;
    
    const allSessions = await db.orm.public.Session.where({
      userId: session.user.id,
    }).all();

    const sessions = allSessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toString(),
      isCurrent: s.id === currentSessionId,
    }));

    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    logServerError('api:account:sessions:GET', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

// DELETE all sessions except current one
export async function DELETE() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const currentSessionId = session.session.id;
    const userId = session.user.id;

    // Delete all sessions except current
    await db.orm.public.Session.where((s) =>
      and(s.userId.eq(userId), not(s.id.eq(currentSessionId))),
    ).delete();

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: session.user.id,
        action: 'SESSIONS_REVOKED_ALL',
        details: JSON.stringify({ exceptSessionId: currentSessionId }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      { success: true, message: 'All other sessions revoked successfully' },
      { status: 200 },
    );
  } catch (error) {
    logServerError('api:account:sessions:DELETE', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
