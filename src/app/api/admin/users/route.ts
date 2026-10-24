import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { roleSchema } from '@/lib/validations';

const querySchema = z.object({
  search: z.string().max(200).trim().optional(),
  role: roleSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/admin/users — searchable, paginated, no secrets. */
export async function GET(request: Request) {
  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      search: url.searchParams.get('search') ?? undefined,
      role: url.searchParams.get('role') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_QUERY', message: 'Ungültige Abfrageparameter.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { search, role, page, pageSize } = parsed.data;
    const all = await db.orm.public.User.all();
    const filtered = all
      .filter((user) => (role ? user.role === role : true))
      .filter((user) =>
        search
          ? user.email.toLowerCase().includes(search.toLowerCase()) ||
            (user.name ?? '').toLowerCase().includes(search.toLowerCase())
          : true,
      )
      .sort(
        (a, b) =>
          Number(b.createdAt.epochMilliseconds) - Number(a.createdAt.epochMilliseconds),
      );

    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return noStoreJson({
      total: filtered.length,
      page,
      pageSize,
      users: items.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified !== null,
        createdAt: user.createdAt.toString(),
      })),
    });
  } catch (error) {
    return errorResponse('api:admin:users:GET', error);
  }
}
