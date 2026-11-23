import { NextRequest } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import { campaignStatsQuerySchema } from '@/lib/advertising/validations';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { requireAdminSession } from '@/lib/server-auth';

/**
 * Campaign statistics for the campaign in the URL.
 *
 * The campaign id is the `[id]` path segment (Next 16 passes route params as a
 * promise); the query string only carries the optional date range.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();

    const { id } = await context.params;
    const query = campaignStatsQuerySchema.parse({
      ...(request.nextUrl.searchParams.get('startDate')
        ? { startDate: request.nextUrl.searchParams.get('startDate') }
        : {}),
      ...(request.nextUrl.searchParams.get('endDate')
        ? { endDate: request.nextUrl.searchParams.get('endDate') }
        : {}),
    });

    const stats = await AdvertisingService.getCampaignStats(
      id,
      query.startDate,
      query.endDate,
    );

    return noStoreJson({ stats });
  } catch (error) {
    return errorResponse('api:admin:advertising:campaigns:[id]:stats:GET', error);
  }
}
