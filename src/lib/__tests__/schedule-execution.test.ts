/**
 * @jest-environment node
 *
 * The transport-independent schedule execution shared by the Vercel Schedules
 * function and the portable cron endpoint.
 */
import {
  beginScheduleRun,
  buildScheduleLogLine,
  executeAnalyticsSchedule,
  isScheduleRunning,
  listAnalyticsScheduleNames,
} from '../analytics/schedule-execution';
import { runAnalyticsSchedule } from '@/lib/analytics/schedules';
import type { AnalyticsScheduleResult } from '@/lib/analytics/schedules';

jest.mock('@/lib/analytics/schedules', () => {
  const schedules = {
    'analytics-traffic': { job: 'traffic' },
    'analytics-repo-stats': { job: 'repo_stats' },
    'analytics-releases': { job: 'releases' },
    'analytics-retention': { retentionOnly: true },
  };

  return {
    ANALYTICS_SCHEDULES: schedules,
    isAnalyticsScheduleName: (name: string) =>
      Object.prototype.hasOwnProperty.call(schedules, name),
    runAnalyticsSchedule: jest.fn(),
  };
});

const runMock = runAnalyticsSchedule as jest.MockedFunction<typeof runAnalyticsSchedule>;

function result(overrides: Partial<AnalyticsScheduleResult> = {}): AnalyticsScheduleResult {
  return {
    schedule: 'analytics-traffic',
    executionId: 'exec-1',
    startedAt: '2026-11-21T03:15:00Z',
    completedAt: '2026-11-21T03:15:02Z',
    durationMs: 2000,
    ok: true,
    errorCode: null,
    sources: ['TRAFFIC_VIEWS'],
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
            itemCount: 3,
            errorCode: null,
          },
        ],
      },
    ],
    retention: null,
    ...overrides,
  };
}

beforeEach(() => {
  runMock.mockReset();
  runMock.mockResolvedValue(result());
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listAnalyticsScheduleNames', () => {
  it('lists the four schedules in declaration order', () => {
    expect(listAnalyticsScheduleNames()).toEqual([
      'analytics-traffic',
      'analytics-repo-stats',
      'analytics-releases',
      'analytics-retention',
    ]);
  });
});

describe('buildScheduleLogLine', () => {
  it('keeps the established structured-log shape', () => {
    const line = buildScheduleLogLine(result(), {
      source: 'static',
      scheduledAt: '2026-11-21T03:15:00.000Z',
    });

    expect(line).toMatchObject({
      event: 'analytics.schedule',
      schedule: 'analytics-traffic',
      executionId: 'exec-1',
      scheduledAt: '2026-11-21T03:15:00.000Z',
      source: 'static',
      ok: true,
      errorCode: null,
      sources: ['TRAFFIC_VIEWS'],
    });
    expect(line['jobs']).toEqual([
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
            errorCode: null,
          },
        ],
      },
    ]);
  });

  it('never includes a message field that could carry upstream details', () => {
    const line = buildScheduleLogLine(result({ ok: false, errorCode: 'UNAVAILABLE' }), {
      source: 'cron',
      scheduledAt: '2026-11-21T03:15:00.000Z',
    });

    expect(Object.keys(line)).not.toContain('message');
    expect(JSON.stringify(line)).not.toMatch(/secret|password/i);
  });
});

describe('beginScheduleRun', () => {
  it('allows one run at a time per schedule and releases afterwards', () => {
    const release = beginScheduleRun('analytics-releases');

    expect(release).not.toBeNull();
    expect(isScheduleRunning('analytics-releases')).toBe(true);
    expect(beginScheduleRun('analytics-releases')).toBeNull();
    // Other schedules are independent.
    const otherRelease = beginScheduleRun('analytics-traffic');
    expect(otherRelease).not.toBeNull();

    release?.();
    otherRelease?.();

    expect(isScheduleRunning('analytics-releases')).toBe(false);
    expect(beginScheduleRun('analytics-releases')).not.toBeNull();
  });
});

describe('executeAnalyticsSchedule', () => {
  it('generates an execution id when none is supplied and logs the run', async () => {
    const outcome = await executeAnalyticsSchedule('analytics-traffic', { source: 'cron' });

    expect(outcome.ok).toBe(true);
    expect(outcome.errorCode).toBeNull();
    expect(outcome.executionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(runMock).toHaveBeenCalledWith('analytics-traffic', outcome.executionId);

    const logged = JSON.parse((console.info as jest.Mock).mock.calls[0][0] as string);
    expect(logged).toMatchObject({ event: 'analytics.schedule', source: 'cron', ok: true });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('uses the supplied execution id (the Vercel case)', async () => {
    // The real task echoes the execution id into its result.
    runMock.mockImplementation(async (_name, executionId) => result({ executionId }));

    await executeAnalyticsSchedule('analytics-traffic', {
      executionId: 'exec-vercel-1',
      scheduledAt: '2026-11-21T03:15:00.000Z',
      source: 'static',
    });

    expect(runMock).toHaveBeenCalledWith('analytics-traffic', 'exec-vercel-1');
    const logged = JSON.parse((console.info as jest.Mock).mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      executionId: 'exec-vercel-1',
      scheduledAt: '2026-11-21T03:15:00.000Z',
      source: 'static',
    });
  });

  it('logs a failed run at error level instead of throwing', async () => {
    runMock.mockResolvedValue(result({ ok: false, errorCode: 'RETENTION_FAILED' }));

    const outcome = await executeAnalyticsSchedule('analytics-retention', { source: 'cron' });

    expect(outcome).toMatchObject({ ok: false, errorCode: 'RETENTION_FAILED' });
    const logged = JSON.parse((console.error as jest.Mock).mock.calls[0][0] as string);
    expect(logged).toMatchObject({ ok: false, errorCode: 'RETENTION_FAILED', level: 'error' });
  });

  it('classifies a thrown task as EXECUTION_FAILED without logging the message', async () => {
    runMock.mockRejectedValue(new Error('GITHUB_TOKEN=leaked-in-message'));

    const outcome = await executeAnalyticsSchedule('analytics-repo-stats', { source: 'cron' });

    expect(outcome).toMatchObject({ ok: false, errorCode: 'EXECUTION_FAILED', result: null });
    const logged = (console.error as jest.Mock).mock.calls[0][0] as string;
    expect(logged).not.toMatch(/leaked-in-message/);
    expect(JSON.parse(logged)).toMatchObject({
      ok: false,
      errorCode: 'EXECUTION_FAILED',
      errorName: 'Error',
    });
  });
});
