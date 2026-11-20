import {
  runAnalyticsRetention,
  runAnalyticsSync,
  type AnalyticsJobId,
  type AnalyticsJobResult,
  type AnalyticsSyncSummary,
} from './sync';
import { runAnalyticsWatchdog, type AnalyticsWatchdogResult } from './watchdog';

/**
 * Static Vercel Schedules share one private function, so the entry point maps
 * `metadata.name` to exactly one task. Names are part of the deployment
 * contract: renaming one deletes its schedule history and must be avoided.
 */
export const ANALYTICS_SCHEDULES = {
  'analytics-traffic': { job: 'traffic' },
  'analytics-repo-stats': { job: 'repo_stats' },
  'analytics-releases': { job: 'releases' },
  'analytics-retention': { retentionOnly: true },
  'analytics-watchdog': { watchdogOnly: true },
} as const satisfies Record<
  string,
  | { job: AnalyticsJobId; retentionOnly?: false; watchdogOnly?: false }
  | { retentionOnly: true; job?: never; watchdogOnly?: false }
  | { watchdogOnly: true; job?: never; retentionOnly?: never }
>;

export type AnalyticsScheduleName = keyof typeof ANALYTICS_SCHEDULES;

export type AnalyticsScheduleResult = {
  schedule: string;
  executionId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
  sources: string[];
  jobs: AnalyticsJobResult[];
  retention: AnalyticsSyncSummary['retention'];
  /** Set only for `analytics-watchdog`. */
  watchdog: AnalyticsWatchdogResult | null;
};

export function isAnalyticsScheduleName(name: string): name is AnalyticsScheduleName {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_SCHEDULES, name);
}

/**
 * Runs the task named by a Vercel schedule. The three analytics tasks never run
 * retention; `analytics-retention` runs nothing else.
 */
export async function runAnalyticsSchedule(
  name: string,
  executionId: string,
): Promise<AnalyticsScheduleResult> {
  if (!isAnalyticsScheduleName(name)) {
    throw new Error(`Unknown analytics schedule: ${name}`);
  }

  const definition = ANALYTICS_SCHEDULES[name];

  if ('retentionOnly' in definition) {
    const result = await runAnalyticsRetention();
    return {
      schedule: name,
      executionId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      ok: result.ok,
      errorCode: result.errorCode,
      sources: ['RETENTION'],
      jobs: [],
      retention: result.retention,
      watchdog: null,
    };
  }

  if ('watchdogOnly' in definition) {
    const result = await runAnalyticsWatchdog();
    return {
      schedule: name,
      executionId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      ok: result.ok,
      errorCode: result.errorCode,
      sources: [],
      jobs: [],
      retention: null,
      watchdog: result,
    };
  }

  const summary = await runAnalyticsSync({
    jobs: [definition.job],
    includeRetention: false,
  });
  const sources = [...new Set(summary.jobs.flatMap((job) => job.outcomes.map((o) => o.source)))];

  return {
    schedule: name,
    executionId,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    ok: summary.ok,
    errorCode: summary.ok
      ? null
      : (summary.errorCode ??
        summary.jobs.find((job) => job.errorCode)?.errorCode ??
        'JOB_FAILED'),
    sources,
    jobs: summary.jobs,
    retention: summary.retention,
    watchdog: null,
  };
}
