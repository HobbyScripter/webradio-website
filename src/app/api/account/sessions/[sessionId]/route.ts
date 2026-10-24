import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { logServerError } from '@/lib/auth-service';

// DELETE a specific session
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const { sessionId } = await params;
    const currentSessionId = session.session.id;

    // Prevent revoking current session through this endpoint
    if (sessionId === currentSessionId) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cannot revoke current session' },
        { status: 403 },
      );
    }

    // Check if session belongs to user
    const targetSession = await db.orm.public.Session.first({ id: sessionId });
    if (!targetSession || targetSession.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Session not found' },
        { status: 404 },
      );
    }

    // Delete the session
    await db.orm.public.Session.where({ id: sessionId }).delete();

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: session.user.id,
        action: 'SESSION_REVOKED',
        details: JSON.stringify({ sessionId }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      { success: true, message: 'Session revoked successfully' },
      { status: 200 },
    );
  } catch (error) {
    logServerError('api:account:sessions:[id]:DELETE', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
