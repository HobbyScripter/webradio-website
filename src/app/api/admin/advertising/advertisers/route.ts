import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import {
  advertiserSchema,
  advertiserStatusSchema,
  advertiserUpdateSchema,
} from '@/lib/advertising/validations';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import { requireAdminSession } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();

    const statusParam = request.nextUrl.searchParams.get('status');
    const status = statusParam ? advertiserStatusSchema.parse(statusParam) : undefined;

    const advertisers = await AdvertisingService.getAdvertisersWithCampaignCounts(
      status ? { status } : undefined,
    );

    return noStoreJson({ advertisers });
  } catch (error) {
    return errorResponse('api:admin:advertising:advertisers:GET', error);
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

    const advertiser = await AdvertisingService.createAdvertiser(advertiserSchema.parse(json.body));

    return noStoreJson({ success: true, advertiser }, 201);
  } catch (error) {
    return errorResponse('api:admin:advertising:advertisers:POST', error);
  }
}

/** Edit details and/or status; only the submitted fields are written. */
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

    const input = advertiserUpdateSchema.parse(json.body);
    const updated = await AdvertisingService.updateAdvertiser(input);

    return noStoreJson({ success: true, advertiser: updated });
  } catch (error) {
    return errorResponse('api:admin:advertising:advertisers:PATCH', error);
  }
}
