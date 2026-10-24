import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/api-response';

export async function GET() {
  try {
    const adminUser = await requireAdminSession();

    const logs = await db.orm.public.AuditLog
      .orderBy((a) => a.createdAt.desc())
      .limit(50)
      .all();

    return NextResponse.json({
      adminId: adminUser.id,
      count: logs.length,
      // Explicit shape: no relations, no internal columns, timestamps as ISO
      // strings (Temporal.Instant does not serialize to JSON on its own).
      logs: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toString(),
      })),
    });
  } catch (error) {
    return errorResponse('api:admin:audit-logs', error);
  }
}
