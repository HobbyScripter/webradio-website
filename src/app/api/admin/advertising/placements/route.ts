import { AdvertisingService } from '@/lib/advertising/service';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { requireAdminSession } from '@/lib/server-auth';

/**
 * GET /api/admin/advertising/placements
 *
 * Placement overview derived from the existing campaign and creative rows: no
 * placement table exists in the contract, so this endpoint only aggregates.
 */
export async function GET() {
  try {
    await requireAdminSession();

    const placements = await AdvertisingService.getPlacementOverview();

    return noStoreJson({ placements });
  } catch (error) {
    return errorResponse('api:admin:advertising:placements:GET', error);
  }
}
