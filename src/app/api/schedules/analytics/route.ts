import { handleSchedule } from '@vercel/schedules';
import { executeAnalyticsSchedule } from '@/lib/analytics/schedule-execution';

/**
 * Private target for the four static Vercel Schedules. The `schedule/v1beta`
 * trigger in vercel.json removes the public URL; only the scheduler invokes it.
 * There is intentionally no GET or manual trigger here.
 *
 * The job logic lives in `@/lib/analytics/schedule-execution`, which is shared
 * with the portable `POST /api/cron/analytics` endpoint. Vercel is only the
 * trigger: the SDK parses the CloudEvent headers, and a failed task throws so
 * the execution is not reported as green.
 */
export const POST = handleSchedule(async (metadata) => {
  const execution = await executeAnalyticsSchedule(metadata.name, {
    executionId: metadata.executionId,
    scheduledAt: metadata.scheduledAt.toISOString(),
    source: metadata.source,
  });

  if (execution.ok) {
    return;
  }

  throw new Error(`Analytics schedule ${execution.schedule} failed: ${execution.errorCode}`);
});
