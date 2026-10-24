import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { errorResponse, noStoreJson } from '@/lib/api-response';

const querySchema = z.object({
  action: z.string().max(100).optional(),
  userId: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/admin/audit-logs
 *
 * Read-only. IP addresses and user agents are intentionally not returned; the
 * actor is identified by its opaque id only.
 */
export async function GET(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      action: url.searchParams.get('action') ?? undefined,
      userId: url.searchParams.get('userId') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_QUERY', message: 'Ungültige Abfrageparameter.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { action, userId, search, page, pageSize } = parsed.data;

    const all = await db.orm.public.AuditLog.orderBy((log) => log.createdAt.desc()).all();
    const filtered = all
      .filter((log) => (action ? log.action === action : true))
      .filter((log) => (userId ? log.userId === userId : true))
      .filter((log) =>
        search ? (log.details ?? '').toLowerCase().includes(search.toLowerCase()) : true,
      );

    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return noStoreJson({
      total: filtered.length,
      page,
      pageSize,
      logs: items.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        details: log.details,
        createdAt: log.createdAt.toString(),
      })),
    });
  } catch (error) {
    return errorResponse('api:admin:audit-logs', error);
  }
}
