import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron-auth';
import { executeTranslationSchedule } from '@/lib/translation/schedule-execution';

/**
 * Portable trigger for the translation worker.
 *
 * Runs the same engine as the admin button and the Vercel Schedule
 * (`POST /api/schedules/translations`), so a Linux server only needs cron or a
 * systemd timer:
 *
 *   curl -fsS -X POST "https://<host>/api/cron/translations?limit=20" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * This URL stays public on purpose — it is the documented external trigger, and
 * every request is authenticated below. The Vercel-side schedule does not use
 * it; it dispatches to the private `/api/schedules/translations` function.
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
function readLimit(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get('limit');
  if (raw === null) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return undefined;
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

  const result = await executeTranslationSchedule({ limit: readLimit(request) });

  if (result.errorCode === 'NOT_CONFIGURED') {
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

  if (result.errorCode === 'JOB_FAILED') {
    console.error(
      JSON.stringify({ event: 'cron.translations.failed', reason: 'JOB_FAILED', level: 'error' }),
    );
    return json({ error: 'JOB_FAILED' }, 500);
  }

  return json(
    {
      ok: result.ok,
      outdated: result.outdated,
      provider: result.provider,
      attempted: result.attempted,
      translated: result.translated,
      skipped: result.skipped,
      blocked: result.blocked,
      failed: result.failed,
      characters: result.characters,
      durationMs: result.durationMs,
    },
    result.failed > 0 ? 500 : 200,
  );
}

export function GET() {
  return json({ error: 'METHOD_NOT_ALLOWED', message: 'Nur POST ist erlaubt.' }, 405, {
    Allow: 'POST',
  });
}
