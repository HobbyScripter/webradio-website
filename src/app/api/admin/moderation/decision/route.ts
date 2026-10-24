import { NextResponse } from 'next/server';
import { errorResponse, noStoreJson, readJsonObject } from '@/lib/api-response';
import { authorizeAdminMutation } from '@/lib/admin-api';
import { decideCatalogEntry } from '@/lib/developer-catalog-service';
import { moderationDecisionSchema } from '@/lib/validations';
import { getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/admin/moderation/decision
 *
 * The service re-checks the admin role, locks the target row and requires the
 * submission to still be PENDING_REVIEW, so stale or duplicated decisions are
 * rejected with 409.
 */
export async function POST(request: Request) {
  const authorized = await authorizeAdminMutation(request, 'moderationDecision');
  if ('response' in authorized) {
    return authorized.response;
  }

  const parsed = await readJsonObject(request);
  if ('response' in parsed) {
    return parsed.response;
  }

  const body = moderationDecisionSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'Ungültige Entscheidung.',
        fields: body.error.flatten().fieldErrors,
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await decideCatalogEntry({
      actorId: authorized.user.id,
      kind: body.data.targetType,
      entryId: body.data.targetId,
      decision: body.data.decision,
      notes: body.data.notes,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    return noStoreJson({ decision: result });
  } catch (error) {
    return errorResponse('api:admin:moderation:decision', error);
  }
}
