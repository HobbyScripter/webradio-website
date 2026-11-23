import { NextRequest, NextResponse } from 'next/server';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import {
  partnerInputSchema,
  partnerStatusSchema,
  partnerUpdateSchema,
} from '@/lib/partner/validations';
import { PartnerService } from '@/lib/partner/service';
import { requireAdminSession } from '@/lib/server-auth';

/** GET /api/admin/partners — full partner list for the admin portal. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();

    const statusParam = request.nextUrl.searchParams.get('status');
    const status = statusParam ? partnerStatusSchema.parse(statusParam) : undefined;

    const partners = await PartnerService.getPartners(status ? { status } : undefined);
    return noStoreJson({ partners });
  } catch (error) {
    return errorResponse('api:admin:partners:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    await requireAdminSession();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const partner = await PartnerService.createPartner(partnerInputSchema.parse(json.body));
    return noStoreJson({ success: true, partner }, 201);
  } catch (error) {
    return errorResponse('api:admin:partners:POST', error);
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

    await requireAdminSession();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const { id, ...changes } = partnerUpdateSchema.parse(json.body);
    const partner = await PartnerService.updatePartner(id, changes);

    return noStoreJson({ success: true, partner });
  } catch (error) {
    return errorResponse('api:admin:partners:PATCH', error);
  }
}
