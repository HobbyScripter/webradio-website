import { NextRequest, NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { runAnalyticsSync } from '@/lib/analytics/sync';

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET']?.trim();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const session = await getServerAuthSession();
  return Boolean(session?.user && hasRole(session.user.role, 'ADMIN'));
}

/**
 * Runs the analytics sources. Vercel Cron calls GET with the CRON_SECRET
 * bearer token; admins may trigger the same run manually with POST.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  if (!(await isAuthorized(request))) {
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
