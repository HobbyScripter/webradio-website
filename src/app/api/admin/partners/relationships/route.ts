import { NextRequest, NextResponse } from 'next/server';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import { PartnerService } from '@/lib/partner/service';
import {
  relationshipCreateSchema,
  relationshipUpdateSchema,
} from '@/lib/partner/validations';
import { requireAdminSession } from '@/lib/server-auth';
import { NotFoundError } from '@/lib/auth-service';

/**
 * Partner relationships are many-per-company: one partner can be an official
 * partner, a sponsor and a technical partner at the same time. Every change is
 * written to PartnerHistory, attributed to the authenticated administrator
 * (never to a client-supplied name).
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    const admin = await requireAdminSession();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const input = relationshipCreateSchema.parse(json.body);
    const relationship = await PartnerService.addRelationship({
      partnerId: input.partnerId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      isPublic: input.isPublic ?? false,
      status: input.status,
    });

    await PartnerService.recordHistory({
      partnerId: input.partnerId,
      relationshipId: relationship.id,
      action: 'RELATIONSHIP_CREATED',
      details: `Added ${input.type} relationship`,
      performedBy: admin.id,
    });

    return noStoreJson({ success: true, relationship }, 201);
  } catch (error) {
    return errorResponse('api:admin:partners:relationships:POST', error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    const admin = await requireAdminSession();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const input = relationshipUpdateSchema.parse(json.body);
    const relationship = await PartnerService.updateRelationship(input.id, {
      status: input.status,
      endDate: input.endDate,
      isPublic: input.isPublic,
    });

    if (!relationship) {
      throw new NotFoundError('Partnerschaftsbeziehung nicht gefunden.');
    }

    await PartnerService.recordHistory({
      partnerId: relationship.partnerId,
      relationshipId: relationship.id,
      action: 'RELATIONSHIP_UPDATED',
      details: input.status ? `Updated relationship to ${input.status}` : 'Updated relationship',
      performedBy: admin.id,
    });

    return noStoreJson({ success: true, relationship });
  } catch (error) {
    return errorResponse('api:admin:partners:relationships:PATCH', error);
  }
}
