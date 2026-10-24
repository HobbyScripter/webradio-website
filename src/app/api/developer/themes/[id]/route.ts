import { requireDeveloperSession } from '@/lib/server-auth';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { authorizeDeveloperMutation, readJsonObject } from '@/lib/developer-api';
import {
  deleteCatalogEntry,
  getOwnedEntry,
  updateCatalogEntry,
} from '@/lib/developer-catalog-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireDeveloperSession();
    const { id } = await params;
    const theme = await getOwnedEntry(user.id, 'THEME', id);
    return noStoreJson({ theme });
  } catch (error) {
    return errorResponse('api:developer:themes:[id]:GET', error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeDeveloperMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  const parsed = await readJsonObject(request);
  if ('response' in parsed) {
    return parsed.response;
  }

  try {
    const { id } = await params;
    const theme = await updateCatalogEntry({
      actorId: authorized.user.id,
      kind: 'THEME',
      entryId: id,
      raw: parsed.body,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ theme });
  } catch (error) {
    return errorResponse('api:developer:themes:[id]:PUT', error);
  }
}

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
    await deleteCatalogEntry({
      actorId: authorized.user.id,
      kind: 'THEME',
      entryId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ success: true });
  } catch (error) {
    return errorResponse('api:developer:themes:[id]:DELETE', error);
  }
}
