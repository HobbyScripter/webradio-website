/**
 * @jest-environment node
 *
 * Vercel Schedules mapping: one task per stable schedule name.
 */
import {
  ANALYTICS_SCHEDULES,
  isAnalyticsScheduleName,
  runAnalyticsSchedule,
} from '../analytics/schedules';
import * as sync from '../analytics/sync';

jest.mock('../analytics/sync', () => ({
  runAnalyticsSync: jest.fn(),
  runAnalyticsRetention: jest.fn(),
}));

const syncMock = sync.runAnalyticsSync as jest.MockedFunction<typeof sync.runAnalyticsSync>;
const retentionMock = sync.runAnalyticsRetention as jest.MockedFunction<
  typeof sync.runAnalyticsRetention
>;

function summary(overrides: Partial<sync.AnalyticsSyncSummary> = {}): sync.AnalyticsSyncSummary {
  return {
    ok: true,
    startedAt: '2026-11-14T03:15:00Z',
    completedAt: '2026-11-14T03:15:01Z',
    durationMs: 1000,
    jobs: [
      {
        job: 'traffic',
        skipped: false,
        attempts: 1,
        errorCode: null,
        outcomes: [
          {
            source: 'TRAFFIC_VIEWS',
            status: 'SUCCESS',
            httpStatus: 200,
            itemCount: 14,
            errorCode: null,
          },
        ],
      },
    ],
    errorCode: null,
    retention: null,
    ...overrides,
  };
}

beforeEach(() => {
  syncMock.mockReset();
  retentionMock.mockReset();
  syncMock.mockResolvedValue(summary());
  retentionMock.mockResolvedValue({
    ok: true,
    startedAt: '2026-11-14T04:45:00Z',
    completedAt: '2026-11-14T04:45:01Z',
    durationMs: 1000,
    retention: { pageViewsDeleted: 4, downloadRequestsDeleted: 2 },
    errorCode: null,
  });
});

describe('ANALYTICS_SCHEDULES', () => {
  it('keeps the four stable schedule names', () => {
    expect(Object.keys(ANALYTICS_SCHEDULES).sort()).toEqual([
      'analytics-releases',
      'analytics-repo-stats',
      'analytics-retention',
      'analytics-traffic',
    ]);
    expect(isAnalyticsScheduleName('analytics-traffic')).toBe(true);
    expect(isAnalyticsScheduleName('analytics-sync')).toBe(false);
  });

  it.each([
    ['analytics-traffic', 'traffic'],
    ['analytics-repo-stats', 'repo_stats'],
    ['analytics-releases', 'releases'],
  ] as const)('runs only %s without retention', async (name, job) => {
    const result = await runAnalyticsSchedule(name, 'exec-1');

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith({ jobs: [job], includeRetention: false });
    expect(retentionMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      schedule: name,
      executionId: 'exec-1',
      ok: true,
      retention: null,
      sources: ['TRAFFIC_VIEWS'],
    });
  });

  it('runs only the retention cleanup for analytics-retention', async () => {
    const result = await runAnalyticsSchedule('analytics-retention', 'exec-2');

    expect(retentionMock).toHaveBeenCalledTimes(1);
    expect(syncMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      schedule: 'analytics-retention',
      executionId: 'exec-2',
      ok: true,
      errorCode: null,
      sources: ['RETENTION'],
      jobs: [],
      retention: { pageViewsDeleted: 4, downloadRequestsDeleted: 2 },
    });
  });

  it('surfaces a failed job with its error code', async () => {
    syncMock.mockResolvedValue(
      summary({
        ok: false,
        jobs: [
          {
            job: 'repo_stats',
            skipped: false,
            attempts: 3,
            errorCode: null,
            outcomes: [
              {
                source: 'REPO_METADATA',
                status: 'FAILED',
                httpStatus: 500,
                itemCount: 0,
                errorCode: 'UNAVAILABLE',
              },
            ],
          },
        ],
      }),
    );

    const result = await runAnalyticsSchedule('analytics-repo-stats', 'exec-3');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('JOB_FAILED');
    expect(result.sources).toEqual(['REPO_METADATA']);
  });

  it('surfaces a skipped job as failure instead of success', async () => {
    syncMock.mockResolvedValue(
      summary({
        ok: false,
        jobs: [
          {
            job: 'releases',
            skipped: true,
            attempts: 0,
            errorCode: 'LOCKED',
            outcomes: [],
          },
        ],
      }),
    );

    const result = await runAnalyticsSchedule('analytics-releases', 'exec-4');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('LOCKED');
  });

  it('maps a failed retention run to RETENTION_FAILED', async () => {
    retentionMock.mockResolvedValue({
      ok: false,
      startedAt: '2026-11-14T04:45:00Z',
      completedAt: '2026-11-14T04:45:01Z',
      durationMs: 1000,
      retention: null,
      errorCode: 'RETENTION_FAILED',
    });

    const result = await runAnalyticsSchedule('analytics-retention', 'exec-5');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('RETENTION_FAILED');
  });

  it('rejects unknown schedule names', async () => {
    await expect(runAnalyticsSchedule('analytics-unknown', 'exec-6')).rejects.toThrow(
      'Unknown analytics schedule',
    );
    expect(syncMock).not.toHaveBeenCalled();
    expect(retentionMock).not.toHaveBeenCalled();
  });
});
