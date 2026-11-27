/**
 * Readiness Check API Endpoint
 *
 * GET /api/ready
 *
 * Unlike `/api/health` (liveness: process and version only), this endpoint
 * proves that the application can actually serve database-backed requests by
 * running `SELECT 1` through the shared Prisma 8 client.
 *
 * Used by:
 *   - Caddy's active upstream health check (`health_uri /api/ready`)
 *   - `deploy/monitoring/health-report.sh` (separate PASS/FAIL from liveness)
 *
 * Returns 200 with `{"status":"ready"}` when the query succeeds and 503 with
 * `{"status":"not_ready"}` when it fails. The error itself is never returned or
 * logged: a driver error can contain host or connection details.
 *
 * Public and unauthenticated like `/api/health`, but deliberately minimal. It
 * opens one pooled connection per probe; Caddy probes every 5 s, which is
 * negligible next to normal request traffic.
 *
 * Vercel: a standard Node.js route handler, no self-hosted-only APIs. The
 * Docker HEALTHCHECK and Vercel deployment checks keep using `/api/health`, so
 * a database outage does not restart the application or fail liveness.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// No route segment config: `cacheComponents` (next.config.ts) rejects
// `dynamic`/`runtime`. The database query below is uncached I/O, so the route
// is evaluated per request and never prerendered; the response is `no-store`.

interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'ok' | 'unavailable';
  };
}

export async function GET(): Promise<NextResponse<ReadinessResponse>> {
  try {
    // Same raw-SQL lane as the rate limiter: build a plan, run it through the
    // shared client. The alias must match the row spec below; without it the
    // column is named "?column?" and decoding fails.
    const plan = db.raw.sql`SELECT 1 AS ok`.returnsRow({ ok: 'pg/int4@1' }).build();
    await db.query(plan);

    return NextResponse.json(
      {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: { database: 'ok' },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // Deliberately no error details: they can include the database host.
    return NextResponse.json(
      {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: { database: 'unavailable' },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
