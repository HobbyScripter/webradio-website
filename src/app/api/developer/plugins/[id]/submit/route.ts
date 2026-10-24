import { errorResponse, noStoreJson } from '@/lib/api-response';
import { authorizeDeveloperMutation } from '@/lib/developer-api';
import { submitCatalogEntry, withdrawCatalogEntry } from '@/lib/developer-catalog-service';

/** POST /api/developer/plugins/[id]/submit — submit for moderation. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeDeveloperMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  try {
    const { id } = await params;
    const plugin = await submitCatalogEntry({
      actorId: authorized.user.id,
      kind: 'PLUGIN',
      entryId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ plugin });
  } catch (error) {
    return errorResponse('api:developer:plugins:[id]:submit:POST', error);
  }
}

/** DELETE /api/developer/plugins/[id]/submit — withdraw a pending submission. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeDeveloperMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  try {
    const { id } = await params;
    const plugin = await withdrawCatalogEntry({
      actorId: authorized.user.id,
      kind: 'PLUGIN',
      entryId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ plugin });
  } catch (error) {
    return errorResponse('api:developer:plugins:[id]:submit:DELETE', error);
  }
}
