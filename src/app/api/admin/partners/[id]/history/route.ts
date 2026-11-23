import { db } from '@/lib/db';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { requireAdminSession } from '@/lib/server-auth';

/**
 * GET /api/admin/partners/[id]/history
 *
 * The audit trail of one partner, newest first, with the relationship that
 * caused each entry. Admin-only: the history also contains internal notes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const history = await db.orm.public.PartnerHistory.where({ partnerId: id })
      .include('relationship')
      .orderBy((entry) => entry.createdAt.desc())
      .all();

    return noStoreJson({ history });
  } catch (error) {
    return errorResponse('api:admin:partners:[id]:history:GET', error);
  }
}
