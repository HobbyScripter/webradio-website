import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/server-auth';
import { errorResponse, noStoreJson, readJsonObject } from '@/lib/api-response';
import { authorizeAdminMutation } from '@/lib/admin-api';
import { deleteNews, getAdminNewsById, setNewsPublished, updateNews } from '@/lib/news-service';
import { NotFoundError } from '@/lib/auth-service';

const publishSchema = z.object({ published: z.boolean() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const article = await getAdminNewsById(id);
    if (!article) {
      throw new NotFoundError('News-Artikel nicht gefunden.');
    }
    return noStoreJson({ article });
  } catch (error) {
    return errorResponse('api:admin:news:[id]:GET', error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdminMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  const parsed = await readJsonObject(request);
  if ('response' in parsed) {
    return parsed.response;
  }

  try {
    const { id } = await params;
    const article = await updateNews({
      actorId: authorized.user.id,
      newsId: id,
      raw: parsed.body,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ article });
  } catch (error) {
    return errorResponse('api:admin:news:[id]:PUT', error);
  }
}

/** PATCH /api/admin/news/[id] — {"published": true|false} */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdminMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  const parsed = await readJsonObject(request);
  if ('response' in parsed) {
    return parsed.response;
  }

  const body = publishSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: '„published“ muss ein Boolean sein.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const { id } = await params;
    const article = await setNewsPublished({
      actorId: authorized.user.id,
      newsId: id,
      published: body.data.published,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ article });
  } catch (error) {
    return errorResponse('api:admin:news:[id]:PATCH', error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdminMutation(request);
  if ('response' in authorized) {
    return authorized.response;
  }

  try {
    const { id } = await params;
    await deleteNews({
      actorId: authorized.user.id,
      newsId: id,
      meta: { userAgent: request.headers.get('user-agent') ?? undefined },
    });
    return noStoreJson({ success: true });
  } catch (error) {
    return errorResponse('api:admin:news:[id]:DELETE', error);
  }
}
