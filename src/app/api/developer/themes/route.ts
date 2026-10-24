import { requireDeveloperSession } from '@/lib/server-auth';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { authorizeDeveloperMutation, readJsonObject } from '@/lib/developer-api';
import { createCatalogEntry, listOwnedEntries } from '@/lib/developer-catalog-service';

/** GET /api/developer/themes — the caller's own themes only. */
export async function GET() {
  try {
    const user = await requireDeveloperSession();
    const themes = await listOwnedEntries(user.id, 'THEME');
    return noStoreJson({ themes });
  } catch (error) {
    return errorResponse('api:developer:themes:GET', error);
  }
}

/** POST /api/developer/themes — create a draft or submit for review. */
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
    const theme = await createCatalogEntry({
      actorId: authorized.user.id,
      kind: 'THEME',
      raw: parsed.body,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ theme }, 201);
  } catch (error) {
    return errorResponse('api:developer:themes:POST', error);
  }
}
