import { errorResponse, noStoreJson } from '@/lib/api-response';
import { PartnerService } from '@/lib/partner/service';

/**
 * GET /api/partners
 *
 * Public listing of approved partners. Only active partners and their active,
 * explicitly public relationships are serialized; internal fields never leave
 * the admin endpoints.
 */
export async function GET() {
  try {
    const partners = await PartnerService.getPublicPartners();
    return noStoreJson({ partners });
  } catch (error) {
    return errorResponse('api:partners:GET', error);
  }
}
