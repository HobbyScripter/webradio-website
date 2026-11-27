import { runTranslationWorker } from './engine';
import { readTranslationConfig } from './registry';

/**
 * One translation worker run, shared by both triggers:
 *
 * - `POST /api/schedules/translations` (Vercel Schedules, private URL),
 * - `POST /api/cron/translations` (cron / systemd, `CRON_SECRET` bearer).
 *
 * Keeping the run in one place means both triggers use the same batch limit,
 * the same configuration check and the same counts. Nothing here logs or
 * returns translated text or the provider key — only numbers and a status.
 */

export type TranslationScheduleResult = {
  ok: boolean;
  errorCode: 'NOT_CONFIGURED' | 'JOB_FAILED' | null;
  provider: string;
  limit: number;
  outdated: number;
  attempted: number;
  translated: number;
  skipped: number;
  blocked: number;
  failed: number;
  characters: number;
  durationMs: number;
};

function result(
  overrides: Partial<TranslationScheduleResult> & { provider: string; limit: number },
): TranslationScheduleResult {
  return {
    ok: true,
    errorCode: null,
    outdated: 0,
    attempted: 0,
    translated: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    characters: 0,
    durationMs: 0,
    ...overrides,
  };
}

export async function executeTranslationSchedule(
  options: { limit?: number } = {},
): Promise<TranslationScheduleResult> {
  const config = readTranslationConfig();
  const limit = options.limit ?? config.batchLimit;

  // A missing key is a configuration state: nothing is sent, and the caller
  // reports it instead of pretending the run succeeded.
  if (config.provider === 'deepl' && !config.deeplConfigured) {
    return result({ ok: false, errorCode: 'NOT_CONFIGURED', provider: config.provider, limit });
  }

  try {
    const run = await runTranslationWorker({ limit });
    return result({
      ok: run.batch.ok,
      errorCode: run.batch.ok ? null : 'JOB_FAILED',
      provider: run.batch.provider,
      limit,
      outdated: run.outdated,
      attempted: run.batch.attempted,
      translated: run.batch.translated,
      skipped: run.batch.skipped,
      blocked: run.batch.blocked,
      failed: run.batch.failed,
      characters: run.batch.characters,
      durationMs: run.batch.durationMs,
    });
  } catch {
    return result({ ok: false, errorCode: 'JOB_FAILED', provider: config.provider, limit });
  }
}
