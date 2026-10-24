import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/server-auth';
import { errorResponse, noStoreJson, readJsonObject } from '@/lib/api-response';
import { authorizeAdminMutation } from '@/lib/admin-api';
import { createNews, listAdminNews } from '@/lib/news-service';

const querySchema = z.object({
  search: z.string().max(200).trim().optional(),
  status: z.enum(['all', 'published', 'draft']).default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

/** GET /api/admin/news — includes drafts; never public. */
export async function GET(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_QUERY', message: 'Ungültige Abfrageparameter.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await listAdminNews(parsed.data);
    return noStoreJson(result);
  } catch (error) {
    return errorResponse('api:admin:news:GET', error);
  }
}

/** POST /api/admin/news — always creates a draft. */
export async function POST(request: Request) {
  const authorized = await authorizeAdminMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  const parsed = await readJsonObject(request);
  if ('response' in parsed) {
    return parsed.response;
  }

  try {
    const article = await createNews({
      actorId: authorized.user.id,
      raw: parsed.body,
      meta: {
        ipAddress: null,
        userAgent: request.headers.get('user-agent') ?? undefined,
      },
    });
    return noStoreJson({ article }, 201);
  } catch (error) {
    return errorResponse('api:admin:news:POST', error);
  }
}
