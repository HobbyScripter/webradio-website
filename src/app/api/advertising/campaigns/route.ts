import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import { adPlacementSchema } from '@/lib/advertising/validations';
import { errorResponse, noStoreJson } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const placement = request.nextUrl.searchParams.get('placement');

    if (!placement) {
      return NextResponse.json(
        { error: 'PLACEMENT_REQUIRED', message: 'Placement required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const parsed = adPlacementSchema.safeParse(placement);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_PLACEMENT', message: 'Unbekannte Platzierung' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const campaigns = await AdvertisingService.getActiveCampaigns(parsed.data);

    return noStoreJson({ campaigns });
  } catch (error) {
    return errorResponse('api:advertising:campaigns:GET', error);
  }
}
