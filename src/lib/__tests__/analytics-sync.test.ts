/**
 * @jest-environment node
 *
 * Sync orchestrator: per-source status rows, retry policy, locks and retention.
 * The GitHub services and the database are mocked.
 */
import { runAnalyticsSync } from '../analytics/sync';
import * as dbModule from '@/lib/db';
import * as trafficService from '../analytics/github-traffic';
import * as repoStatsService from '../analytics/github-repo-stats';
import * as downloadService from '../download-analytics-service';
import * as websiteService from '../analytics/website';

jest.mock('../analytics/github-traffic', () => ({ syncGitHubTraffic: jest.fn() }));
jest.mock('../analytics/github-repo-stats', () => ({ syncGitHubRepoStats: jest.fn() }));
jest.mock('../download-analytics-service', () => ({ syncGitHubDownloadStats: jest.fn() }));
jest.mock('../analytics/website', () => ({ cleanupAnalyticsRetention: jest.fn() }));

jest.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;
  const state = { runs: [] as Row[], statuses: [] as Row[] };

  const normalize = (value: unknown) =>
    value !== null && typeof value === 'object' ? String(value) : value;

  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => normalize(row[key]) === normalize(value));

  const runWhere = (where: Row) => {
    const chain = {
      all: async () => state.runs.filter((row) => matches(row, where)),
      where: () => chain,
      update: async (data: Row) => {
        const row = state.runs.find((candidate) => matches(candidate, where));
        if (row) Object.assign(row, data);
      },
    };
    return chain;
  };

  return {
    __syncState: state,
    db: {
      orm: {
        public: {
          AnalyticsSyncRun: {
            create: async (data: Row) => {
              const row = { id: `run-${state.runs.length + 1}`, ...data };
              state.runs.push(row);
              return row;
            },
            where: (where: Row) => runWhere(where),
            orderBy: () => ({
              limit: () => ({ all: async () => [...state.runs] }),
            }),
          },
          AnalyticsSourceStatus: {
            first: async (where: Row) =>
              state.statuses.find((row) => matches(row, where)) ?? null,
            create: async (data: Row) => {
              const row = { id: `status-${state.statuses.length + 1}`, ...data };
              state.statuses.push(row);
              return row;
            },
            where: (where: Row) => ({
              update: async (data: Row) => {
                const row = state.statuses.find((candidate) => matches(candidate, where));
                if (!row) throw new Error('status row not found');
                Object.assign(row, data);
              },
            }),
          },
        },
      },
    },
  };
});

const state = (
  dbModule as unknown as { __syncState: { runs: Record<string, unknown>[]; statuses: Record<string, unknown>[] } }
).__syncState;

const trafficMock = trafficService.syncGitHubTraffic as jest.MockedFunction<
  typeof trafficService.syncGitHubTraffic
>;
const repoMock = repoStatsService.syncGitHubRepoStats as jest.MockedFunction<
  typeof repoStatsService.syncGitHubRepoStats
>;
const downloadMock = downloadService.syncGitHubDownloadStats as jest.MockedFunction<
  typeof downloadService.syncGitHubDownloadStats
>;
const retentionMock = websiteService.cleanupAnalyticsRetention as jest.MockedFunction<
  typeof websiteService.cleanupAnalyticsRetention
>;

function trafficSuccess(): trafficService.TrafficSyncResult {
  return { success: true, daysStored: 14, referrersStored: 3, pathsStored: 4, errors: [] };
}

function repoSuccess(): repoStatsService.RepoStatsSyncResult {
  return {
    success: true,
    results: [
      'metadata',
      'commit_activity',
      'contributors',
      'code_frequency',
      'participation',
      'punch_card',
    ].map((source) => ({
      source: source as repoStatsService.RepoStatsSource,
      outcome: 'OK' as const,
      httpStatus: 200,
      itemCount: 1,
    })),
  };
}

beforeEach(() => {
  state.runs.length = 0;
  state.statuses.length = 0;
  trafficMock.mockReset();
  repoMock.mockReset();
  downloadMock.mockReset();
  retentionMock.mockReset();
  trafficMock.mockResolvedValue(trafficSuccess());
  repoMock.mockResolvedValue(repoSuccess());
  downloadMock.mockResolvedValue({
    success: true,
    syncedAssetsCount: 8,
    totalGitHubDownloads: 100,
    durationMs: 5,
  });
  retentionMock.mockResolvedValue({ pageViewsDeleted: 2, downloadRequestsDeleted: 1 });
});

describe('runAnalyticsSync', () => {
  it('records SUCCESS for all eleven sources and runs retention', async () => {
    const summary = await runAnalyticsSync({ retryDelaysMs: [] });

    expect(summary.ok).toBe(true);
    expect(summary.jobs).toHaveLength(3);
    expect(summary.jobs.every((job) => !job.skipped && job.attempts === 1)).toBe(true);
    expect(summary.retention).toEqual({ pageViewsDeleted: 2, downloadRequestsDeleted: 1 });

    expect(state.runs).toHaveLength(11);
    expect(state.runs.every((run) => run.status === 'SUCCESS')).toBe(true);
    expect(state.statuses).toHaveLength(11);
    expect(state.statuses.every((status) => status.lastSuccessAt !== undefined)).toBe(true);
  });

  it('keeps a partial traffic failure isolated and does not retry a permission error', async () => {
    trafficMock.mockResolvedValue({
      success: false,
      daysStored: 14,
      referrersStored: 0,
      pathsStored: 0,
      errors: [{ source: 'referrers', code: 'PERMISSION_DENIED', status: 403 }],
    });

    const summary = await runAnalyticsSync({ retryDelaysMs: [0, 0] });

    const traffic = summary.jobs.find((job) => job.job === 'traffic');
    expect(traffic?.attempts).toBe(1);
    expect(traffic?.outcomes.find((outcome) => outcome.source === 'TRAFFIC_VIEWS')?.status).toBe(
      'SUCCESS',
    );
    expect(
      traffic?.outcomes.find((outcome) => outcome.source === 'TRAFFIC_REFERRERS'),
    ).toMatchObject({ status: 'FAILED', errorCode: 'PERMISSION_DENIED', httpStatus: 403 });
    expect(summary.ok).toBe(false);
    expect(trafficMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and stops after the configured attempts', async () => {
    repoMock
      .mockResolvedValueOnce({
        success: false,
        results: [
          {
            source: 'metadata',
            outcome: 'UNAVAILABLE',
            httpStatus: null,
            itemCount: 0,
          },
        ],
      })
      .mockResolvedValueOnce(repoSuccess());

    const summary = await runAnalyticsSync({ jobs: ['repo_stats'], retryDelaysMs: [0, 0] });

    expect(summary.jobs[0].attempts).toBe(2);
    expect(repoMock).toHaveBeenCalledTimes(2);
    expect(summary.ok).toBe(true);
  });

  it('maps 202/204/422 outcomes and keeps them non-failing', async () => {
    repoMock.mockResolvedValue({
      success: true,
      results: [
        { source: 'metadata', outcome: 'PENDING', httpStatus: 202, itemCount: 0 },
        { source: 'commit_activity', outcome: 'EMPTY', httpStatus: 204, itemCount: 0 },
        { source: 'contributors', outcome: 'UNSUPPORTED', httpStatus: 422, itemCount: 0 },
      ],
    });

    const summary = await runAnalyticsSync({ jobs: ['repo_stats'], retryDelaysMs: [] });

    expect(summary.ok).toBe(true);
    const statuses = Object.fromEntries(
      summary.jobs[0].outcomes.map((outcome) => [outcome.source, outcome.status]),
    );
    expect(statuses).toMatchObject({
      REPO_METADATA: 'PENDING',
      COMMIT_ACTIVITY: 'EMPTY',
      CONTRIBUTORS: 'UNSUPPORTED',
    });
  });

  it('skips a job whose source is already running', async () => {
    state.runs.push({
      id: 'existing',
      source: 'TRAFFIC_VIEWS',
      status: 'RUNNING',
      startedAt: Temporal.Now.instant(),
    });

    const summary = await runAnalyticsSync({ retryDelaysMs: [] });

    const traffic = summary.jobs.find((job) => job.job === 'traffic');
    expect(traffic?.skipped).toBe(true);
    expect(traffic?.errorCode).toBe('LOCKED');
    expect(summary.ok).toBe(false);
    expect(trafficMock).not.toHaveBeenCalled();
    expect(repoMock).toHaveBeenCalledTimes(1);
  });

  it('does not run retention when a scheduled job disables it', async () => {
    const summary = await runAnalyticsSync({
      jobs: ['traffic'],
      includeRetention: false,
      retryDelaysMs: [],
    });

    expect(summary.ok).toBe(true);
    expect(summary.retention).toBeNull();
    expect(retentionMock).not.toHaveBeenCalled();
  });

  it('reports a lock lookup failure distinctly from lock contention', async () => {
    const spy = jest
      .spyOn(dbModule.db.orm.public.AnalyticsSyncRun, 'where')
      .mockImplementationOnce(() => {
        throw new Error('db down');
      });

    const summary = await runAnalyticsSync({ jobs: ['traffic'], retryDelaysMs: [] });

    expect(summary.jobs[0]).toMatchObject({ skipped: true, errorCode: 'LOCK_ERROR' });
    expect(summary.ok).toBe(false);
    spy.mockRestore();
  });

  it('reports a failed retention cleanup as a failed run', async () => {
    retentionMock.mockRejectedValue(new Error('db down'));

    const summary = await runAnalyticsSync({ jobs: ['releases'], retryDelaysMs: [] });

    expect(summary.ok).toBe(false);
    expect(summary.errorCode).toBe('RETENTION_FAILED');
    expect(summary.retention).toBeNull();
    expect(summary.jobs.every((job) => !job.skipped)).toBe(true);
  });

  it('clears the retention error code when the cleanup succeeds', async () => {
    const summary = await runAnalyticsSync({ jobs: ['releases'], retryDelaysMs: [] });

    expect(summary.ok).toBe(true);
    expect(summary.errorCode).toBeNull();
    expect(summary.retention).toEqual({ pageViewsDeleted: 2, downloadRequestsDeleted: 1 });
  });
});
