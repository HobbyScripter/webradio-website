import { NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { runAnalyticsSync } from '@/lib/analytics/sync';

/**
 * Manual runs are admin-only. Scheduled runs no longer call this endpoint: they
 * use the private `analytics-*` Schedules in `vercel.json`, so the former
 * `CRON_SECRET` bearer path has no caller left. It was removed instead of kept
 * as an unused second way in.
 */
async function isAuthorized(): Promise<boolean> {
  const session = await getServerAuthSession();
  return Boolean(session?.user && hasRole(session.user.role, 'ADMIN'));
}

/**
 * Runs all analytics sources plus retention for a logged-in admin. `GET` and
 * `POST` behave identically; both require an admin session.
 */
async function handle(): Promise<NextResponse> {
  if (!(await isAuthorized())) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Zugriff verweigert.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const summary = await runAnalyticsSync();

  return NextResponse.json(summary, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(): Promise<NextResponse> {
  return handle();
}

export async function POST(): Promise<NextResponse> {
  return handle();
}
