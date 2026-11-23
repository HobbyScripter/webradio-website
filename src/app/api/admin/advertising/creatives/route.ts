import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import { creativeQuerySchema, creativeSchema } from '@/lib/advertising/validations';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import { requireAdminSession } from '@/lib/server-auth';
import { z } from 'zod';

const deleteQuerySchema = z.object({ id: z.string().uuid('Ungültige Werbemittel-ID') });

/** GET /api/admin/advertising/creatives?campaignId=… — creatives for the admin. */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();

    const query = creativeQuerySchema.parse({
      ...(request.nextUrl.searchParams.get('campaignId')
        ? { campaignId: request.nextUrl.searchParams.get('campaignId') }
        : {}),
    });

    const creatives = await AdvertisingService.getCreatives(query.campaignId);

    return noStoreJson({ creatives });
  } catch (error) {
    return errorResponse('api:admin:advertising:creatives:GET', error);
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

    const creative = await AdvertisingService.createCreative(creativeSchema.parse(json.body));

    return noStoreJson({ success: true, creative }, 201);
  } catch (error) {
    return errorResponse('api:admin:advertising:creatives:POST', error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    await requireAdminSession();

    const query = deleteQuerySchema.parse({
      ...(request.nextUrl.searchParams.get('id')
        ? { id: request.nextUrl.searchParams.get('id') }
        : {}),
    });

    const deleted = await AdvertisingService.deleteCreative(query.id);

    return noStoreJson({ success: Boolean(deleted) });
  } catch (error) {
    return errorResponse('api:admin:advertising:creatives:DELETE', error);
  }
}
