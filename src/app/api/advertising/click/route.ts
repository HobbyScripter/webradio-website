import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import { trackingEventSchema } from '@/lib/advertising/validations';
import { errorResponse, isSameOriginRequest, noStoreJson, readJsonObject } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const parsed = trackingEventSchema.safeParse(json.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: 'Missing or invalid required fields' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await AdvertisingService.recordClick(parsed.data.campaignId, parsed.data.placement);

    return noStoreJson({ success: true });
  } catch (error) {
    return errorResponse('api:advertising:click', error);
  }
}
