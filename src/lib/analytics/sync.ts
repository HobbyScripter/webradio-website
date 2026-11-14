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
};

export type AnalyticsSyncSummary = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  jobs: AnalyticsJobResult[];
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

/**
 * Runs the analytics jobs with a per-source lock, bounded retries and durable
 * status rows. A failing job never prevents the other jobs from running, and a
 * source that is already running is skipped rather than duplicated.
 */
export async function runAnalyticsSync(
  options: { jobs?: AnalyticsJobId[]; retryDelaysMs?: number[] } = {},
): Promise<AnalyticsSyncSummary> {
  const startedAt = Temporal.Now.instant();
  const startMs = Date.now();
  const jobsToRun = options.jobs?.length ? options.jobs : ALL_JOBS;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const results: AnalyticsJobResult[] = [];

  for (const job of jobsToRun) {
    const sources = JOB_SOURCES[job];
    let locks: Record<string, string> | null = null;
    try {
      locks = await acquireLocks(sources);
    } catch {
      results.push({ job, skipped: true, attempts: 0, outcomes: [] });
      continue;
    }

    if (!locks) {
      results.push({ job, skipped: true, attempts: 0, outcomes: [] });
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

    results.push({ job, skipped: false, attempts, outcomes });
  }

  let retention: AnalyticsSyncSummary['retention'] = null;
  try {
    retention = await cleanupAnalyticsRetention();
  } catch {
    retention = null;
  }

  const ok = results.every(
    (result) =>
      result.skipped ||
      result.outcomes.every((outcome) => outcome.status !== 'FAILED'),
  );

  return {
    ok,
    startedAt: String(startedAt),
    completedAt: String(Temporal.Now.instant()),
    durationMs: Date.now() - startMs,
    jobs: results,
    retention,
  };
}
