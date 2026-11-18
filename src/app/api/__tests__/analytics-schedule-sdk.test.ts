/**
 * @jest-environment node
 *
 * Exercises the real `@vercel/schedules` wrapper instead of mocking it: the
 * CloudEvent headers are parsed by the SDK, a successful task answers 200 and a
 * failing task throws so Next.js returns 500 (the SDK does not swallow it).
 */
import { POST } from '../schedules/analytics/route';
import { runAnalyticsSchedule } from '@/lib/analytics/schedules';
import type { AnalyticsScheduleResult } from '@/lib/analytics/schedules';

jest.mock('@/lib/analytics/schedules', () => ({ runAnalyticsSchedule: jest.fn() }));

const runMock = runAnalyticsSchedule as jest.MockedFunction<typeof runAnalyticsSchedule>;

const HEADERS: Record<string, string> = {
  'ce-specversion': '1.0',
  'ce-type': 'com.vercel.schedule.v1beta',
  'ce-source': '/vercel/schedules',
  'ce-id': 'exec-1',
  'ce-vssscheduledat': '2026-11-18T03:15:00.000Z',
  'ce-vssscheduleid': 'sched-1',
  'ce-vssschedulename': 'analytics-traffic',
  'ce-vssnamespace': 'default',
  'ce-vssschedulesource': 'static',
  'ce-vssexpression': '15 3 * * *',
};

function dispatch(headers: Record<string, string> = HEADERS): Request {
  return new Request('https://webradio.example/api/schedules/analytics', {
    method: 'POST',
    headers,
  });
}

function result(overrides: Partial<AnalyticsScheduleResult> = {}): AnalyticsScheduleResult {
  return {
    schedule: 'analytics-traffic',
    executionId: 'exec-1',
    startedAt: '2026-11-18T03:15:00Z',
    completedAt: '2026-11-18T03:15:01Z',
    durationMs: 1000,
    ok: true,
    errorCode: null,
    sources: ['TRAFFIC_VIEWS'],
    jobs: [],
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

describe('analytics schedule function (real SDK)', () => {
  it('parses the dispatch and answers 200', async () => {
    const response = await POST(dispatch());

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledWith('analytics-traffic', 'exec-1');
  });

  it('throws when the task fails, so the execution is not green', async () => {
    runMock.mockResolvedValue(result({ ok: false, errorCode: 'LOCKED' }));

    await expect(POST(dispatch())).rejects.toThrow('failed: LOCKED');
  });

  it('rejects a request without schedule headers with 400', async () => {
    const response = await POST(dispatch({ 'ce-specversion': '1.0' }));

    expect(response.status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });
});
