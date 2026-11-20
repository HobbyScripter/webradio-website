/**
 * @jest-environment node
 *
 * The Vercel Schedules entry point maps metadata.name to one task and reports
 * failures with a structured log plus a 500.
 */
import { POST } from '../schedules/analytics/route';
import { runAnalyticsSchedule } from '@/lib/analytics/schedules';
import type { ScheduleMetadata } from '@vercel/schedules';

jest.mock('@vercel/schedules', () => ({
  handleSchedule: (handler: unknown) => handler,
}));
jest.mock('@/lib/analytics/schedules', () => ({ runAnalyticsSchedule: jest.fn() }));

const runMock = runAnalyticsSchedule as jest.MockedFunction<typeof runAnalyticsSchedule>;
const handler = POST as unknown as (metadata: ScheduleMetadata) => Promise<void>;

const metadata: ScheduleMetadata = {
  scheduleId: 'sched-1',
  executionId: 'exec-1',
  name: 'analytics-traffic',
  namespace: 'default',
  scheduledAt: new Date('2026-11-14T03:15:00Z'),
  source: 'static',
  expression: '15 3 * * *',
};

function result(overrides: Record<string, unknown> = {}) {
  return {
    schedule: 'analytics-traffic',
    executionId: 'exec-1',
    startedAt: '2026-11-14T03:15:00Z',
    completedAt: '2026-11-14T03:15:01Z',
    durationMs: 1000,
    ok: true,
    errorCode: null,
    sources: ['TRAFFIC_VIEWS'],
    jobs: [],
    retention: null,
    watchdog: null,
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

describe('scheduled analytics route', () => {
  it('dispatches by metadata.name and logs the execution', async () => {
    await handler(metadata);

    expect(runMock).toHaveBeenCalledWith('analytics-traffic', 'exec-1');
    const line = JSON.parse((console.info as jest.Mock).mock.calls[0][0]);
    expect(line).toMatchObject({
      event: 'analytics.schedule',
      schedule: 'analytics-traffic',
      executionId: 'exec-1',
      ok: true,
      errorCode: null,
      sources: ['TRAFFIC_VIEWS'],
    });
  });

  it('logs and throws when the task fails', async () => {
    runMock.mockResolvedValue(
      result({ ok: false, errorCode: 'LOCKED', sources: [], jobs: [] }),
    );

    await expect(handler(metadata)).rejects.toThrow('failed: LOCKED');
    const line = JSON.parse((console.error as jest.Mock).mock.calls[0][0]);
    expect(line).toMatchObject({
      event: 'analytics.schedule',
      schedule: 'analytics-traffic',
      executionId: 'exec-1',
      ok: false,
      errorCode: 'LOCKED',
      level: 'error',
    });
  });
});
