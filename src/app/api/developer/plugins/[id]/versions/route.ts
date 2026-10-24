import { errorResponse, noStoreJson } from '@/lib/api-response';
import { authorizeDeveloperMutation, readJsonObject } from '@/lib/developer-api';
import { addCatalogVersion } from '@/lib/developer-catalog-service';

/** POST /api/developer/plugins/[id]/versions */
export async function POST(
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
    const version = await addCatalogVersion({
      actorId: authorized.user.id,
      kind: 'PLUGIN',
      entryId: id,
      raw: parsed.body,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ version }, 201);
  } catch (error) {
    return errorResponse('api:developer:plugins:[id]:versions:POST', error);
  }
}
