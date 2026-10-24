import { requireDeveloperSession } from '@/lib/server-auth';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { authorizeDeveloperMutation, readJsonObject } from '@/lib/developer-api';
import { createCatalogEntry, listOwnedEntries } from '@/lib/developer-catalog-service';

/** GET /api/developer/plugins — the caller's own plugins only. */
export async function GET() {
  try {
    const user = await requireDeveloperSession();
    const plugins = await listOwnedEntries(user.id, 'PLUGIN');
    return noStoreJson({ plugins });
  } catch (error) {
    return errorResponse('api:developer:plugins:GET', error);
  }
}

/** POST /api/developer/plugins — create a draft or submit for review. */
export async function POST(request: Request) {
  const authorized = await authorizeDeveloperMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  const parsed = await readJsonObject(request);
  if ('response' in parsed) {
    return parsed.response;
  }

  try {
    const plugin = await createCatalogEntry({
      actorId: authorized.user.id,
      kind: 'PLUGIN',
      raw: parsed.body,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ plugin }, 201);
  } catch (error) {
    return errorResponse('api:developer:plugins:POST', error);
  }
}
