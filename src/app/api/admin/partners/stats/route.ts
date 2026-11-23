import { errorResponse, noStoreJson } from '@/lib/api-response';
import { PartnerService } from '@/lib/partner/service';
import { requireAdminSession } from '@/lib/server-auth';

export async function GET() {
  try {
    await requireAdminSession();
    const stats = await PartnerService.getPartnerStats();
    return noStoreJson({ stats });
  } catch (error) {
    return errorResponse('api:admin:partners:stats:GET', error);
  }
}
