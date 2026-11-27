import { randomUUID } from 'node:crypto';
import {
  ANALYTICS_SCHEDULES,
  runAnalyticsSchedule,
  type AnalyticsScheduleName,
  type AnalyticsScheduleResult,
} from './schedules';

/**
 * Transport-independent execution of one analytics schedule.
 *
 * The schedule names and the job bodies already live in `./schedules` and
 * `./sync`, which know nothing about Vercel. This module adds the parts both
 * triggers need — execution id, structured log line, failure classification —
 * so `POST /api/schedules/analytics` (Vercel) and `POST /api/cron/analytics`
 * (cron/systemd/curl) run the same code instead of two copies.
 */

/**
 * All schedule names, in declaration order. A function rather than a module
 * constant so importing this module never evaluates the schedule table eagerly.
 */
export function listAnalyticsScheduleNames(): AnalyticsScheduleName[] {
  return Object.keys(ANALYTICS_SCHEDULES) as AnalyticsScheduleName[];
}

/** Where a run came from. `static` is what Vercel reports for its schedules. */
export type ScheduleSource = string;

export type ScheduleExecutionContext = {
  /** Vercel supplies one; cron runs get a generated UUID. */
  executionId?: string;
  scheduledAt?: string;
  source: ScheduleSource;
};

export type ScheduleExecutionOutcome = {
  schedule: string;
  executionId: string;
  ok: boolean;
  /** `EXECUTION_FAILED` when the task threw before producing a result. */
  errorCode: string | null;
  result: AnalyticsScheduleResult | null;
};

/**
 * In-process guard against two overlapping runs of the *same* schedule.
 *
 * It is not the only protection: `runAnalyticsSync` additionally takes durable
 * per-source locks in `AnalyticsSyncRun`, which is what covers several
 * processes. This guard exists so a duplicate request is rejected immediately
 * with a clear status instead of starting a run that the database lock would
 * skip anyway.
 */
const runningSchedules = new Set<string>();

/**
 * Returns a release function when the schedule is free, or `null` when it is
 * already running in this process. Always call the release function in a
 * `finally` block.
 */
export function beginScheduleRun(schedule: string): (() => void) | null {
  if (runningSchedules.has(schedule)) {
    return null;
  }

  runningSchedules.add(schedule);
  return () => {
    runningSchedules.delete(schedule);
  };
}

/** Test/diagnostic helper; the HTTP layer never needs it. */
export function isScheduleRunning(schedule: string): boolean {
  return runningSchedules.has(schedule);
}

/** The one log shape used by both triggers. Secret-free by construction. */
export function buildScheduleLogLine(
  result: AnalyticsScheduleResult,
  context: { source: ScheduleSource; scheduledAt: string },
): Record<string, unknown> {
  return {
    event: 'analytics.schedule',
    schedule: result.schedule,
    executionId: result.executionId,
    scheduledAt: context.scheduledAt,
    source: context.source,
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
}

/**
 * Runs one schedule and logs the outcome. Never throws: the caller decides how
 * a failure maps onto its transport (Vercel wants a throwing handler so the
 * execution is not green; cron wants a 5xx JSON body).
 */
export async function executeAnalyticsSchedule(
  name: string,
  context: ScheduleExecutionContext,
): Promise<ScheduleExecutionOutcome> {
  const executionId = context.executionId ?? randomUUID();

  let result: AnalyticsScheduleResult;
  try {
    result = await runAnalyticsSchedule(name, executionId);
  } catch (error) {
    // Only the error type is logged: messages may carry upstream details.
    console.error(
      JSON.stringify({
        event: 'analytics.schedule',
        schedule: name,
        executionId,
        source: context.source,
        ok: false,
        errorCode: 'EXECUTION_FAILED',
        errorName: error instanceof Error ? error.name : 'Error',
        level: 'error',
      }),
    );

    return {
      schedule: name,
      executionId,
      ok: false,
      errorCode: 'EXECUTION_FAILED',
      result: null,
    };
  }

  const line = buildScheduleLogLine(result, {
    source: context.source,
    scheduledAt: context.scheduledAt ?? result.startedAt,
  });

  if (result.ok) {
    console.info(JSON.stringify(line));
  } else {
    console.error(JSON.stringify({ ...line, level: 'error' }));
  }

  return {
    schedule: result.schedule,
    executionId,
    ok: result.ok,
    errorCode: result.errorCode,
    result,
  };
}
