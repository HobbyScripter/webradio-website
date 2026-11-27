import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron-auth';
import { runTranslationWorker } from '@/lib/translation/engine';
import { readTranslationConfig } from '@/lib/translation/registry';

/**
 * Portable trigger for the translation worker.
 *
 * Runs the same engine as the admin button, so a Linux server only needs cron
 * (or a systemd timer) — Vercel Schedules calls the same route:
 *
 *   curl -fsS -X POST "https://<host>/api/cron/translations?limit=20" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Guarantees:
 * - fails closed without `CRON_SECRET` (503) and rejects a wrong token (401),
 * - never sends anything without a configured provider (503 + `NOT_CONFIGURED`),
 * - processes only published content (see `translation/source.ts`),
 * - is idempotent: the persistent job key prevents a second paid call for the
 *   same source text and target language,
 * - logs and returns counts only — never translated text, never the API key.
 *
 * Only POST is accepted.
 */

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...RESPONSE_HEADERS, ...extraHeaders } });
}

/** Bounded so one run always fits the function timeout. */
function readLimit(request: Request, fallback: number): number {
  const raw = new URL(request.url).searchParams.get('limit');
  const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 1), 100);
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = verifyCronRequest(request);

  if (auth.status === 'misconfigured') {
    console.error(
      JSON.stringify({ event: 'cron.translations.rejected', reason: 'CRON_SECRET_MISSING', level: 'error' }),
    );
    return json(
      {
        error: 'CRON_DISABLED',
        message: 'Der Cron-Endpunkt ist nicht konfiguriert (CRON_SECRET fehlt).',
      },
      503,
    );
  }

  if (auth.status === 'unauthorized') {
    console.warn(JSON.stringify({ event: 'cron.translations.rejected', reason: 'UNAUTHORIZED' }));
    return json({ error: 'UNAUTHORIZED', message: 'Zugriff verweigert.' }, 401);
  }

  const config = readTranslationConfig();
  if (config.provider === 'deepl' && !config.deeplConfigured) {
    console.warn(
      JSON.stringify({ event: 'cron.translations.skipped', reason: 'NOT_CONFIGURED' }),
    );
    return json(
      {
        error: 'NOT_CONFIGURED',
        message: 'Kein Übersetzungsanbieter konfiguriert (DEEPL_API_KEY fehlt).',
      },
      503,
    );
  }

  const limit = readLimit(request, config.batchLimit);

  try {
    const result = await runTranslationWorker({ limit });
    const body = {
      ok: result.batch.ok,
      outdated: result.outdated,
      provider: result.batch.provider,
      attempted: result.batch.attempted,
      translated: result.batch.translated,
      skipped: result.batch.skipped,
      blocked: result.batch.blocked,
      failed: result.batch.failed,
      characters: result.batch.characters,
      durationMs: result.batch.durationMs,
    };

    return json(body, result.batch.failed > 0 ? 500 : 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'cron.translations.failed',
        reason: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return json({ error: 'JOB_FAILED' }, 500);
  }
}

export function GET() {
  return json({ error: 'METHOD_NOT_ALLOWED', message: 'Nur POST ist erlaubt.' }, 405, {
    Allow: 'POST',
  });
}
