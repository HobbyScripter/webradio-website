import { handleSchedule } from '@vercel/schedules';
import { runAnalyticsSchedule } from '@/lib/analytics/schedules';

/**
 * Private target for the four static Vercel Schedules. The `schedule/v1beta`
 * trigger in vercel.json removes the public URL; only the scheduler invokes it.
 * There is intentionally no GET or manual trigger here.
 */
export const POST = handleSchedule(async (metadata) => {
  const result = await runAnalyticsSchedule(metadata.name, metadata.executionId);
  const line = {
    event: 'analytics.schedule',
    schedule: result.schedule,
    executionId: metadata.executionId,
    scheduledAt: metadata.scheduledAt.toISOString(),
    source: metadata.source,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ok: result.ok,
    errorCode: result.errorCode,
    sources: result.sources,
    jobs: result.jobs.map((job) => ({
      job: job.job,
      skipped: job.skipped,
      attempts: job.attempts,
      errorCode: job.errorCode,
      outcomes: job.outcomes.map((outcome) => ({
        source: outcome.source,
        status: outcome.status,
        httpStatus: outcome.httpStatus,
        errorCode: outcome.errorCode,
      })),
    })),
    retention: result.retention,
  };

  if (result.ok) {
    console.info(JSON.stringify(line));
    return;
  }

  console.error(JSON.stringify({ ...line, level: 'error' }));
  throw new Error(`Analytics schedule ${result.schedule} failed: ${result.errorCode}`);
});
