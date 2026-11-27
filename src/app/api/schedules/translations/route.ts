import { handleSchedule } from '@vercel/schedules';
import { executeTranslationSchedule } from '@/lib/translation/schedule-execution';

/**
 * Private target for the `translations-worker` Vercel Schedule. The
 * `schedule/v1beta` trigger in vercel.json removes the public URL; only the
 * scheduler invokes it. There is intentionally no GET or manual trigger here —
 * `POST /api/cron/translations` stays the portable, `CRON_SECRET`-protected
 * entry point for cron and systemd timers.
 *
 * The SDK parses the CloudEvent headers (a request without them answers 400),
 * and a failed run throws so the execution is not reported as green. Logs carry
 * counts only — never translated text, never the provider key.
 */
export const POST = handleSchedule(async (metadata) => {
  const execution = await executeTranslationSchedule();

  const entry = {
    event: 'translations.schedule',
    schedule: metadata.name,
    executionId: metadata.executionId,
    source: metadata.source,
    ok: execution.ok,
    errorCode: execution.errorCode,
    provider: execution.provider,
    attempted: execution.attempted,
    translated: execution.translated,
    skipped: execution.skipped,
    blocked: execution.blocked,
    failed: execution.failed,
    characters: execution.characters,
    durationMs: execution.durationMs,
  };

  if (execution.ok) {
    console.info(JSON.stringify(entry));
    return;
  }

  console.error(JSON.stringify({ ...entry, level: 'error' }));
  throw new Error(`Translation schedule ${metadata.name} failed: ${execution.errorCode}`);
});
