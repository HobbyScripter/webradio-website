import { NextRequest, NextResponse } from 'next/server';
import 'temporal-polyfill/global';
import type * as DbModule from '@/lib/db';
import {
  claimWebhookDelivery,
  getGitHubAppConfig,
  verifyGitHubWebhookSignature,
} from '@/lib/github-app';
import { syncGitHubDownloadStats } from '@/lib/download-analytics-service';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('@/lib/db');
  return mod.db;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getGitHubAppConfig();
  if (!config.webhookSecret) {
    return NextResponse.json(
      { error: 'WEBHOOK_NOT_CONFIGURED', message: 'GitHub Webhook Secret ist auf dem Server nicht konfiguriert.' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  // 1. Verify HMAC SHA256 signature
  if (!verifyGitHubWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json(
      { error: 'INVALID_SIGNATURE', message: 'Ungültige Webhook-Signatur.' },
      { status: 401 },
    );
  }

  const deliveryId = request.headers.get('x-github-delivery');
  const event = request.headers.get('x-github-event') || 'unknown';

  if (!deliveryId) {
    return NextResponse.json(
      { error: 'MISSING_DELIVERY_ID', message: 'Fehlende GitHub Delivery ID.' },
      { status: 400 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Ungültiges JSON-Payload.' },
      { status: 400 },
    );
  }

  const action = typeof payload.action === 'string' ? payload.action : null;
  const repoObj = payload.repository && typeof payload.repository === 'object'
    ? (payload.repository as Record<string, unknown>)
    : null;
  const repository = typeof repoObj?.full_name === 'string' ? repoObj.full_name : null;

  // 2. Repository constraint: only accept events for YourEliteSystems/WebRadio
  if (repository && repository.toLowerCase() !== 'yourelitesystems/webradio') {
    return NextResponse.json(
      { error: 'REPOSITORY_MISMATCH', message: 'Webhook nicht für dieses Repository vorgesehen.' },
      { status: 403 },
    );
  }

  // 3. Idempotent check (Replay / duplicate delivery protection)
  const isFirstTime = await claimWebhookDelivery(deliveryId, event, action, repository);
  if (!isFirstTime) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  const db = await getDb();

  const installObj = payload.installation && typeof payload.installation === 'object'
    ? (payload.installation as Record<string, unknown>)
    : null;
  const accountObj = installObj?.account && typeof installObj.account === 'object'
    ? (installObj.account as Record<string, unknown>)
    : null;

  // 4. Update lastWebhookAt for installation if present
  if (installObj?.id) {
    const instId = BigInt(String(installObj.id));
    try {
      await db.orm.public.GitHubAppInstallation.where({ installationId: instId }).update({
        lastWebhookAt: Temporal.Now.instant(),
      });
    } catch {
      // ignore
    }
  }

  // 5. Handle installation events (connect, suspend, delete)
  if (event === 'installation' || event === 'installation_repositories') {
    if (installObj?.id) {
      const instId = BigInt(String(installObj.id));
      const appName = typeof installObj.app_slug === 'string' ? installObj.app_slug : 'WebRadio GitHub App';
      const accountLogin = typeof accountObj?.login === 'string' ? accountObj.login : 'YourEliteSystems';

      if (action === 'deleted') {
        await db.orm.public.GitHubAppInstallation.where({ installationId: instId }).update({
          status: 'DELETED',
        });
      } else if (action === 'suspend') {
        await db.orm.public.GitHubAppInstallation.where({ installationId: instId }).update({
          status: 'SUSPENDED',
        });
      } else if (action === 'unsuspend' || action === 'created') {
        const existing = await db.orm.public.GitHubAppInstallation.first({ installationId: instId });
        if (existing) {
          await db.orm.public.GitHubAppInstallation.where({ id: existing.id }).update({
            status: 'CONNECTED',
            appName,
            accountLogin,
          });
        } else {
          await db.orm.public.GitHubAppInstallation.create({
            installationId: instId,
            appName,
            accountLogin,
            repositoryName: 'YourEliteSystems/WebRadio',
            status: 'CONNECTED',
          });
        }
      }
    }
    return NextResponse.json({ ok: true, handled: 'installation' });
  }

  // 6. Handle release event: Trigger background synchronization of download metrics and assets
  if (event === 'release') {
    // Only act on published, created, edited, or released
    if (action === 'published' || action === 'released' || action === 'created' || action === 'edited') {
      // Run sync in non-blocking manner
      syncGitHubDownloadStats({ force: true }).catch(() => {});
    }
    return NextResponse.json({ ok: true, handled: 'release' });
  }

  return NextResponse.json({ ok: true, unhandled: event });
}

