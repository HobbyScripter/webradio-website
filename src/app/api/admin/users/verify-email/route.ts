import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/server-auth';
import { verifyUserEmailManually } from '@/lib/account-suspension';
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { getClientIp } from '@/lib/rate-limit';
import { enforceRateLimits } from '@/lib/rate-limit-http';

const bodySchema = z.object({ userId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson({ error: 'FORBIDDEN', message: 'Cross-origin request rejected.' }, 403);
    }

    const admin = await requireAdminSession();
    const limited = await enforceRateLimits([{ scope: 'adminUserWrite', identifier: admin.id }]);
    if (limited) return limited;

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Ungueltige Eingabe.' }, { status: 400 });
    }

    const result = await verifyUserEmailManually({
      actorId: admin.id,
      targetUserId: parsed.data.userId,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return noStoreJson({ user: result });
  } catch (error) {
    return errorResponse('api:admin:users:verify-email', error);
  }
}