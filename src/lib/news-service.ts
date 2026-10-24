/**
 * News management service (admin only).
 *
 * The public read path (`catalog.ts`) filters on `isPublished = true` AND
 * `publishedAt <= now`, so drafts and withdrawn articles never reach a public
 * page or API — independent of what this service does.
 *
 * The acting administrator is re-read from PostgreSQL inside each transaction;
 * an ADMIN or SYSTEM_ADMIN passes, every other role is rejected.
 */
import { db } from './db';
import { AuthError, ForbiddenError, NotFoundError, hasRole } from './auth-service';
import { newsCreateSchema, newsUpdateSchema, type Role } from './validations';

export class NewsConflictError extends AuthError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, 409, code);
    this.name = 'NewsConflictError';
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RequestMeta = { ipAddress?: string | null; userAgent?: string | null };

async function requireAdminActor(tx: Transaction, actorId: string) {
  const actor = await tx.orm.public.User.first({ id: actorId });
  if (!actor) {
    throw new NotFoundError('Benutzerkonto nicht gefunden.');
  }
  if (!hasRole(actor.role as Role, 'ADMIN')) {
    throw new ForbiddenError('Für die News-Verwaltung ist die Administratorrolle erforderlich.');
  }
  return actor;
}

async function writeAudit(
  tx: Transaction,
  actorId: string,
  action: string,
  details: unknown,
  meta?: RequestMeta,
): Promise<void> {
  await tx.orm.public.AuditLog.create({
    userId: actorId,
    action,
    details: details ? JSON.stringify(details) : null,
    ipAddress: meta?.ipAddress ?? null,
    userAgent: meta?.userAgent ?? null,
  });
}

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } },
): T {
  if (!result.success) {
    throw new AuthError(
      result.error.issues.map((issue) => issue.message).join(' '),
      400,
      'VALIDATION_ERROR',
    );
  }
  return result.data;
}

export type AdminNewsItem = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toAdminNewsItem(row: {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  isPublished: boolean;
  publishedAt: Temporal.Instant | null;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
}): AdminNewsItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    content: row.content,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt ? row.publishedAt.toString() : null,
    createdAt: row.createdAt.toString(),
    updatedAt: row.updatedAt.toString(),
  };
}

export async function listAdminNews(input: {
  search?: string;
  status?: 'all' | 'published' | 'draft';
  page?: number;
  pageSize?: number;
}): Promise<{ items: AdminNewsItem[]; total: number; published: number; draft: number }> {
  const search = input.search?.trim() ?? '';
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10));

  let query = db.orm.public.News.orderBy((news) => news.createdAt.desc());
  if (search) {
    query = query.where((news) => news.title.ilike(`%${search}%`));
  }

  const all = await query.all();
  const filtered = all.filter((row) => {
    if (input.status === 'published') return row.isPublished;
    if (input.status === 'draft') return !row.isPublished;
    return true;
  });

  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map(toAdminNewsItem),
    total: filtered.length,
    published: all.filter((row) => row.isPublished).length,
    draft: all.filter((row) => !row.isPublished).length,
  };
}

export async function getAdminNewsBySlug(slug: string): Promise<AdminNewsItem | null> {
  const row = await db.orm.public.News.first({ slug });
  return row ? toAdminNewsItem(row) : null;
}

export async function getAdminNewsById(id: string): Promise<AdminNewsItem | null> {
  const row = await db.orm.public.News.first({ id });
  return row ? toAdminNewsItem(row) : null;
}

export async function createNews(input: {
  actorId: string;
  raw: unknown;
  meta?: RequestMeta;
}): Promise<AdminNewsItem> {
  const data = parseOrThrow(newsCreateSchema.safeParse(input.raw));

  return db.transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);

    const duplicate = await tx.orm.public.News.first({ slug: data.slug });
    if (duplicate) {
      throw new NewsConflictError('Dieser News-Slug ist bereits vergeben.', 'SLUG_EXISTS');
    }

    const created = await tx.orm.public.News.create({
      slug: data.slug,
      title: data.title,
      summary: data.summary || null,
      content: data.content,
      // Publishing is always a separate, audited transition.
      isPublished: false,
      publishedAt: null,
    });

    await writeAudit(
      tx,
      input.actorId,
      'NEWS_CREATED',
      { newsId: created.id, slug: created.slug },
      input.meta,
    );

    return toAdminNewsItem(created);
  });
}

export async function updateNews(input: {
  actorId: string;
  newsId: string;
  raw: unknown;
  meta?: RequestMeta;
}): Promise<AdminNewsItem> {
  const data = parseOrThrow(newsUpdateSchema.safeParse(input.raw));

  return db.transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);

    const existing = await tx.orm.public.News.first({ id: input.newsId });
    if (!existing) {
      throw new NotFoundError('News-Artikel nicht gefunden.');
    }

    if (data.slug !== existing.slug) {
      const duplicate = await tx.orm.public.News.first({ slug: data.slug });
      if (duplicate && duplicate.id !== existing.id) {
        throw new NewsConflictError('Dieser News-Slug ist bereits vergeben.', 'SLUG_EXISTS');
      }
    }

    await tx.orm.public.News.where({ id: existing.id }).update({
      slug: data.slug,
      title: data.title,
      summary: data.summary || null,
      content: data.content,
    });

    const updated = await tx.orm.public.News.first({ id: existing.id });
    if (!updated) {
      throw new NotFoundError('News-Artikel nicht gefunden.');
    }

    await writeAudit(
      tx,
      input.actorId,
      'NEWS_UPDATED',
      {
        newsId: existing.id,
        changes: {
          slug: existing.slug !== data.slug,
          title: existing.title !== data.title,
          summary: (existing.summary ?? '') !== (data.summary ?? ''),
          content: existing.content !== data.content,
        },
      },
      input.meta,
    );

    return toAdminNewsItem(updated);
  });
}

export async function setNewsPublished(input: {
  actorId: string;
  newsId: string;
  published: boolean;
  meta?: RequestMeta;
}): Promise<AdminNewsItem> {
  return db.transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);

    const existing = await tx.orm.public.News.first({ id: input.newsId });
    if (!existing) {
      throw new NotFoundError('News-Artikel nicht gefunden.');
    }

    if (existing.isPublished === input.published) {
      // Idempotent: no duplicate audit entry, same visible state.
      return toAdminNewsItem(existing);
    }

    await tx.orm.public.News.where({ id: existing.id }).update({
      isPublished: input.published,
      publishedAt: input.published
        ? (existing.publishedAt ?? Temporal.Now.instant())
        : existing.publishedAt,
    });

    const updated = await tx.orm.public.News.first({ id: existing.id });
    if (!updated) {
      throw new NotFoundError('News-Artikel nicht gefunden.');
    }

    await writeAudit(
      tx,
      input.actorId,
      input.published ? 'NEWS_PUBLISHED' : 'NEWS_UNPUBLISHED',
      { newsId: existing.id, slug: existing.slug },
      input.meta,
    );

    return toAdminNewsItem(updated);
  });
}

export async function deleteNews(input: {
  actorId: string;
  newsId: string;
  meta?: RequestMeta;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);

    const existing = await tx.orm.public.News.first({ id: input.newsId });
    if (!existing) {
      throw new NotFoundError('News-Artikel nicht gefunden.');
    }

    await tx.orm.public.News.where({ id: existing.id }).delete();

    await writeAudit(
      tx,
      input.actorId,
      'NEWS_DELETED',
      { newsId: existing.id, slug: existing.slug, wasPublished: existing.isPublished },
      input.meta,
    );
  });
}

/** Dashboard counts; no rows are fabricated when the table is empty. */
export async function getNewsStats(): Promise<{ total: number; published: number; draft: number }> {
  const rows = await db.orm.public.News.all();
  return {
    total: rows.length,
    published: rows.filter((row) => row.isPublished).length,
    draft: rows.filter((row) => !row.isPublished).length,
  };
}
