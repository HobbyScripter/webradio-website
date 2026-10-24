import { errorResponse, noStoreJson } from '@/lib/api-response';
import { authorizeDeveloperMutation } from '@/lib/developer-api';
import { submitCatalogEntry, withdrawCatalogEntry } from '@/lib/developer-catalog-service';

/** POST /api/developer/themes/[id]/submit */
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
    const theme = await submitCatalogEntry({
      actorId: authorized.user.id,
      kind: 'THEME',
      entryId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ theme });
  } catch (error) {
    return errorResponse('api:developer:themes:[id]:submit:POST', error);
  }
}

/** DELETE /api/developer/themes/[id]/submit */
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
    const theme = await withdrawCatalogEntry({
      actorId: authorized.user.id,
      kind: 'THEME',
      entryId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ theme });
  } catch (error) {
    return errorResponse('api:developer:themes:[id]:submit:DELETE', error);
  }
}
