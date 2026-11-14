import { NextRequest, NextResponse } from 'next/server';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { syncGitHubDownloadStats } from '@/lib/download-analytics-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check authorization: either admin session or CRON_SECRET bearer token
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET']?.trim();

  let isAuthorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  } else {
    const session = await getServerAuthSession();
    if (session?.user && hasRole(session.user.role, 'ADMIN')) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Zugriff verweigert.' },
      { status: 401 },
    );
  }

  const result = await syncGitHubDownloadStats();

  if (!result.success && result.error?.includes('bereits')) {
    return NextResponse.json(
      { error: 'ALREADY_RUNNING', message: result.error },
      { status: 409 },
    );
  }

  if (!result.success) {
    return NextResponse.json(
      { error: 'SYNC_FAILED', message: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    syncedAssetsCount: result.syncedAssetsCount,
    totalGitHubDownloads: result.totalGitHubDownloads,
    durationMs: result.durationMs,
  });
}

