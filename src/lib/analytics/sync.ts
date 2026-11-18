import 'temporal-polyfill/global';
import { syncGitHubDownloadStats } from '../download-analytics-service';
import { syncGitHubRepoStats } from './github-repo-stats';
import { syncGitHubTraffic, type TrafficSyncResult } from './github-traffic';
import { cleanupAnalyticsRetention } from './website';
import { db } from '@/lib/db';

const LOCK_TIMEOUT_MINUTES = 5;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 4_000];

export type AnalyticsJobId = 'traffic' | 'repo_stats' | 'releases';

type SourceOutcome = {
  source: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EMPTY' | 'UNSUPPORTED';
  httpStatus: number | null;
  itemCount: number;
  errorCode: string | null;
};

export type AnalyticsJobResult = {
  job: AnalyticsJobId;
  skipped: boolean;
  attempts: number;
  outcomes: SourceOutcome[];
  /** Why a job did not run, or why it failed as a whole. */
  errorCode: 'LOCKED' | 'LOCK_ERROR' | null;
};

export type AnalyticsSyncSummary = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  jobs: AnalyticsJobResult[];
  /** Set when the optional retention cleanup failed; it is never silent. */
  errorCode: 'RETENTION_FAILED' | null;
  retention: { pageViewsDeleted: number; downloadRequestsDeleted: number } | null;
};

const JOB_SOURCES: Record<AnalyticsJobId, string[]> = {
  traffic: ['TRAFFIC_VIEWS', 'TRAFFIC_CLONES', 'TRAFFIC_REFERRERS', 'TRAFFIC_PATHS'],
  repo_stats: [
    'REPO_METADATA',
    'COMMIT_ACTIVITY',
    'CONTRIBUTORS',
    'CODE_FREQUENCY',
    'PARTICIPATION',
    'PUNCH_CARD',
  ],
  releases: ['RELEASES'],
};

const ALL_JOBS: AnalyticsJobId[] = ['traffic', 'repo_stats', 'releases'];

function mapTraffic(result: TrafficSyncResult): SourceOutcome[] {
  const sources: {
    source: string;
    errorKey: 'views' | 'clones' | 'referrers' | 'paths';
    itemCount: number;
  }[] = [
    { source: 'TRAFFIC_VIEWS', errorKey: 'views', itemCount: result.daysStored },
    { source: 'TRAFFIC_CLONES', errorKey: 'clones', itemCount: result.daysStored },
    { source: 'TRAFFIC_REFERRERS', errorKey: 'referrers', itemCount: result.referrersStored },
    { source: 'TRAFFIC_PATHS', errorKey: 'paths', itemCount: result.pathsStored },
  ];

  return sources.map(({ source, errorKey, itemCount }) => {
    const error = result.errors.find((entry) => entry.source === errorKey);
    if (!error) {
      return {
        source,
        status: 'SUCCESS' as const,
        httpStatus: 200,
        itemCount,
        errorCode: null,
      };
    }
    return {
      source,
      status: 'FAILED' as const,
      httpStatus: error.status,
      itemCount: 0,
      errorCode: error.code,
    };
  });
}

async function runTraffic(): Promise<SourceOutcome[]> {
  return mapTraffic(await syncGitHubTraffic());
}

async function runRepoStats(): Promise<SourceOutcome[]> {
  const result = await syncGitHubRepoStats();
  return result.results.map((entry) => ({
    source:
      entry.source === 'metadata'
        ? 'REPO_METADATA'
        : entry.source === 'commit_activity'
          ? 'COMMIT_ACTIVITY'
          : entry.source === 'contributors'
            ? 'CONTRIBUTORS'
            : entry.source === 'code_frequency'
              ? 'CODE_FREQUENCY'
              : entry.source === 'participation'
                ? 'PARTICIPATION'
                : 'PUNCH_CARD',
    status:
      entry.outcome === 'OK'
        ? 'SUCCESS'
        : entry.outcome === 'PENDING'
          ? 'PENDING'
          : entry.outcome === 'EMPTY'
            ? 'EMPTY'
            : entry.outcome === 'UNSUPPORTED'
              ? 'UNSUPPORTED'
              : 'FAILED',
    httpStatus: entry.httpStatus,
    itemCount: entry.itemCount,
    errorCode:
      entry.outcome === 'OK' ||
      entry.outcome === 'PENDING' ||
      entry.outcome === 'EMPTY' ||
      entry.outcome === 'UNSUPPORTED'
        ? null
        : entry.outcome,
  }));
}

async function runReleases(): Promise<SourceOutcome[]> {
  const result = await syncGitHubDownloadStats();
  if (result.success) {
    return [
      {
        source: 'RELEASES',
        status: 'SUCCESS',
        httpStatus: 200,
        itemCount: result.syncedAssetsCount,
        errorCode: null,
      },
    ];
  }
  return [
    {
      source: 'RELEASES',
      status: 'FAILED',
      httpStatus: null,
      itemCount: 0,
      errorCode: result.error?.includes('bereits') ? 'ALREADY_RUNNING' : 'SYNC_FAILED',
    },
  ];
}

const RUNNERS: Record<AnalyticsJobId, () => Promise<SourceOutcome[]>> = {
  traffic: runTraffic,
  repo_stats: runRepoStats,
  releases: runReleases,
};

function isRetryable(outcomes: SourceOutcome[]): boolean {
  const blocking = new Set([
    'PERMISSION_DENIED',
    'NOT_CONFIGURED',
    'NOT_FOUND',
    'INVALID_RESPONSE',
    'ALREADY_RUNNING',
    'RATE_LIMITED',
    'UNSUPPORTED',
  ]);
  return outcomes.some(
    (outcome) => outcome.status === 'FAILED' && !blocking.has(outcome.errorCode ?? ''),
  );
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLocks(sources: string[]): Promise<Record<string, string> | null> {
  const cutoff = Temporal.Now.instant().subtract({ minutes: LOCK_TIMEOUT_MINUTES });
  const running = await db.orm.public.AnalyticsSyncRun
    .where({ status: 'RUNNING' })
    .where((row) => row.startedAt.gt(cutoff))
    .all();

  if (running.some((row) => sources.includes(row.source))) {
    return null;
  }

  const locks: Record<string, string> = {};
  for (const source of sources) {
    const run = await db.orm.public.AnalyticsSyncRun.create({
      source: source as never,
      status: 'RUNNING',
      startedAt: Temporal.Now.instant(),
    });
    locks[source] = run.id;
  }
  return locks;
}

async function finishRuns(
  locks: Record<string, string>,
  outcomes: SourceOutcome[],
  startedAt: Temporal.Instant,
): Promise<void> {
  const completedAt = Temporal.Now.instant();
  for (const outcome of outcomes) {
    const id = locks[outcome.source];
    if (id) {
      await db.orm.public.AnalyticsSyncRun.where({ id }).update({
        status: outcome.status as never,
        completedAt,
        httpStatus: outcome.httpStatus,
        itemCount: outcome.itemCount,
        errorCode: outcome.errorCode,
      });
    }

    const existing = await db.orm.public.AnalyticsSourceStatus.first({
      source: outcome.source as never,
    });
    const values = {
      status: outcome.status as never,
      lastHttpStatus: outcome.httpStatus,
      lastErrorCode: outcome.errorCode,
      lastErrorMessage: outcome.errorCode ? `Quelle meldete ${outcome.errorCode}.` : null,
      ...(outcome.status === 'FAILED'
        ? { lastFailureAt: completedAt }
        : { lastSuccessAt: completedAt }),
    };

    if (existing) {
      await db.orm.public.AnalyticsSourceStatus.where({ id: existing.id }).update(values);
    } else {
      await db.orm.public.AnalyticsSourceStatus.create({
        source: outcome.source as never,
        ...values,
        ...(outcome.status === 'FAILED'
          ? { lastFailureAt: completedAt }
          : { lastSuccessAt: startedAt }),
      });
    }
  }
}

export type AnalyticsRetentionResult = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  retention: AnalyticsSyncSummary['retention'];
  errorCode: 'RETENTION_FAILED' | null;
};

/**
 * Runs only the retention cleanup. Schedules use this as a dedicated task so
 * the three analytics jobs never delete data as a side effect.
 */
export async function runAnalyticsRetention(): Promise<AnalyticsRetentionResult> {
  const startedAt = Temporal.Now.instant();
  const startMs = Date.now();
  try {
    const retention = await cleanupAnalyticsRetention();
    return {
      ok: true,
      startedAt: String(startedAt),
      completedAt: String(Temporal.Now.instant()),
      durationMs: Date.now() - startMs,
      retention,
      errorCode: null,
    };
  } catch {
    return {
      ok: false,
      startedAt: String(startedAt),
      completedAt: String(Temporal.Now.instant()),
      durationMs: Date.now() - startMs,
      retention: null,
      errorCode: 'RETENTION_FAILED',
    };
  }
}

/**
 * Runs the analytics jobs with a per-source lock, bounded retries and durable
 * status rows. A failing job never prevents the other jobs from running, and a
 * source that is already running is skipped rather than duplicated.
 */
export async function runAnalyticsSync(
  options: {
    jobs?: AnalyticsJobId[];
    retryDelaysMs?: number[];
    /** Cleanup runs by default; schedules disable it and run it separately. */
    includeRetention?: boolean;
  } = {},
): Promise<AnalyticsSyncSummary> {
  const startedAt = Temporal.Now.instant();
  const startMs = Date.now();
  const jobsToRun = options.jobs?.length ? options.jobs : ALL_JOBS;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const includeRetention = options.includeRetention !== false;
  const results: AnalyticsJobResult[] = [];

  for (const job of jobsToRun) {
    const sources = JOB_SOURCES[job];
    let locks: Record<string, string> | null = null;
    try {
      locks = await acquireLocks(sources);
    } catch {
      results.push({
        job,
        skipped: true,
        attempts: 0,
        outcomes: [],
        errorCode: 'LOCK_ERROR',
      });
      continue;
    }

    if (!locks) {
      results.push({ job, skipped: true, attempts: 0, outcomes: [], errorCode: 'LOCKED' });
      continue;
    }

    let attempts = 0;
    let outcomes: SourceOutcome[] = [];
    try {
      for (;;) {
        attempts += 1;
        outcomes = await RUNNERS[job]();
        if (!isRetryable(outcomes) || attempts > retryDelays.length) break;
        await sleep(retryDelays[attempts - 1] ?? 0);
      }
    } catch {
      outcomes = sources.map((source) => ({
        source,
        status: 'FAILED' as const,
        httpStatus: null,
        itemCount: 0,
        errorCode: 'UNAVAILABLE',
      }));
    }

    try {
      await finishRuns(locks, outcomes, startedAt);
    } catch {
      // Status persistence must not fail the whole run; the next run repairs it.
    }

    results.push({ job, skipped: false, attempts, outcomes, errorCode: null });
  }

  let retention: AnalyticsSyncSummary['retention'] = null;
  let retentionError: AnalyticsSyncSummary['errorCode'] = null;
  if (includeRetention) {
    try {
      retention = await cleanupAnalyticsRetention();
    } catch {
      // A failed cleanup must not be reported as a successful run; the manual
      // admin run reports the same errorCode the dedicated schedule surfaces.
      retention = null;
      retentionError = 'RETENTION_FAILED';
    }
  }

  // A skipped job is not a success: the schedule run must surface the lock so
  // the execution history does not report green while nothing was synced.
  const jobsOk = results.every(
    (result) =>
      !result.skipped && result.outcomes.every((outcome) => outcome.status !== 'FAILED'),
  );
  const ok = jobsOk && retentionError === null;

  return {
    ok,
    startedAt: String(startedAt),
    completedAt: String(Temporal.Now.instant()),
    durationMs: Date.now() - startMs,
    jobs: results,
    errorCode: retentionError,
    retention,
  };
}
