import type { NextRequest } from 'next/server';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { parseLocale } from '@/i18n/config';
import { PartnerService } from '@/lib/partner/service';

/**
 * GET /api/partners
 *
 * Public listing of approved partners. Only active partners and their active,
 * explicitly public relationships are serialized; internal fields never leave
 * the admin endpoints.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = parseLocale(request.nextUrl.searchParams.get('locale') ?? undefined);
    const partners = await PartnerService.getPublicPartners(locale ?? undefined);
    return noStoreJson({ partners });
  } catch (error) {
    return errorResponse('api:partners:GET', error);
  }
}
