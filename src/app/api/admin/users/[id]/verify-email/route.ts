import { requireAdminSession } from '@/lib/server-auth';
import { verifyUserEmailManually } from '@/lib/account-suspension';
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { getClientIp } from '@/lib/rate-limit';
import { enforceRateLimits } from '@/lib/rate-limit-http';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson({ error: 'FORBIDDEN', message: 'Cross-origin request rejected.' }, 403);
    }

    const admin = await requireAdminSession();
    const limited = await enforceRateLimits([{ scope: 'adminUserWrite', identifier: admin.id }]);
    if (limited) return limited;

    const { id } = await params;
    const result = await verifyUserEmailManually({
      actorId: admin.id,
      targetUserId: id,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return noStoreJson({ user: result });
  } catch (error) {
    return errorResponse('api:admin:users:verify-email', error);
  }
}