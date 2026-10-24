/**
 * POST /api/admin/users/role
 *
 * Changes a user's role. Two independent server-side checks apply:
 *   1. `requireAdminSession()` validates the caller's live database session.
 *   2. `changeUserRole()` re-reads the caller's role from PostgreSQL and
 *      refuses anything below ADMIN (SYSTEM_ADMIN also satisfies the check),
 *      then writes the change and its audit log entry in one transaction.
 *
 * The requested role comes from a validated server-side payload; it is never
 * taken from a registration field or a client-supplied "isAdmin" flag.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/server-auth';
import { changeUserRole } from '@/lib/auth-service';
import { assignableRoleSchema } from '@/lib/validations';
import { errorResponse, isSameOriginRequest } from '@/lib/api-response';
import { getClientIp } from '@/lib/rate-limit';

const bodySchema = z.object({
  userId: z.string().min(1),
  // SYSTEM_ADMIN is deliberately not assignable here. It is created only by
  // the audited CLI bootstrap/recovery path.
  role: assignableRoleSchema,
});

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    const admin = await requireAdminSession();

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Eingabe.',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await changeUserRole({
      actorId: admin.id,
      targetUserId: parsed.data.userId,
      newRole: parsed.data.role,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ user: result });
  } catch (error) {
    return errorResponse('api:admin:users:role', error);
  }
}
