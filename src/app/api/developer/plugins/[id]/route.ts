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
    const plugin = await getOwnedEntry(user.id, 'PLUGIN', id);
    return noStoreJson({ plugin });
  } catch (error) {
    return errorResponse('api:developer:plugins:[id]:GET', error);
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
    const plugin = await updateCatalogEntry({
      actorId: authorized.user.id,
      kind: 'PLUGIN',
      entryId: id,
      raw: parsed.body,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ plugin });
  } catch (error) {
    return errorResponse('api:developer:plugins:[id]:PUT', error);
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
      kind: 'PLUGIN',
      entryId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ success: true });
  } catch (error) {
    return errorResponse('api:developer:plugins:[id]:DELETE', error);
  }
}
