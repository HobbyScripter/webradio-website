/**
 * @jest-environment node
 *
 * The portable cron endpoint: CRON_SECRET authentication, method restrictions,
 * schedule selection, duplicate-run protection and failure mapping.
 */
import { GET, POST } from '../cron/analytics/route';
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

const SECRET = 'cron-route-secret-8b2d';
const CRON_URL = 'http://localhost/api/cron/analytics';

function result(overrides: Partial<AnalyticsScheduleResult> = {}): AnalyticsScheduleResult {
  return {
    schedule: 'analytics-traffic',
    executionId: 'exec-1',
    startedAt: '2026-11-21T03:15:00Z',
    completedAt: '2026-11-21T03:15:01Z',
    durationMs: 1000,
    ok: true,
    errorCode: null,
    sources: ['TRAFFIC_VIEWS'],
    jobs: [],
    retention: null,
    ...overrides,
  };
}

function postRequest(
  headers: Record<string, string> = {},
  body?: string,
  url = CRON_URL,
): Request {
  return new Request(url, {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

function authorized(secret = SECRET): Record<string, string> {
  return { authorization: `Bearer ${secret}` };
}

type CronBody = {
  ok: boolean;
  error?: string;
  executions: { schedule: string; ok: boolean; errorCode: string | null }[];
};

beforeEach(() => {
  process.env['CRON_SECRET'] = SECRET;
  runMock.mockReset();
  runMock.mockResolvedValue(result());
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env['CRON_SECRET'];
  jest.restoreAllMocks();
});

describe('POST /api/cron/analytics – authentication', () => {
  it('rejects a request without an Authorization header', async () => {
    const response = await POST(postRequest());

    expect(response.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret with 401 and runs nothing', async () => {
    const response = await POST(postRequest(authorized('not-the-secret')));

    expect(response.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
    expect((await response.json()) as CronBody).toMatchObject({ error: 'UNAUTHORIZED' });
  });

  it('rejects a non-bearer scheme', async () => {
    const response = await POST(
      postRequest({ authorization: `Basic ${Buffer.from(SECRET).toString('base64')}` }),
    );

    expect(response.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when CRON_SECRET is not configured', async () => {
    delete process.env['CRON_SECRET'];

    const response = await POST(postRequest(authorized()));

    expect(response.status).toBe(503);
    expect(runMock).not.toHaveBeenCalled();
    expect((await response.json()) as CronBody).toMatchObject({ error: 'CRON_DISABLED' });
  });

  it('never logs or returns the secret', async () => {
    await POST(postRequest(authorized('wrong-secret')));
    await POST(postRequest(authorized()));

    const logged = [
      ...(console.warn as jest.Mock).mock.calls.flat(),
      ...(console.error as jest.Mock).mock.calls.flat(),
      ...(console.info as jest.Mock).mock.calls.flat(),
    ]
      .map((entry) => String(entry))
      .join('\n');

    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain('wrong-secret');
  });
});

describe('POST /api/cron/analytics – execution', () => {
  it('runs every schedule in order when no schedule is named', async () => {
    const response = await POST(postRequest(authorized()));
    const body = (await response.json()) as CronBody;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(runMock.mock.calls.map((call) => call[0])).toEqual([
      'analytics-traffic',
      'analytics-repo-stats',
      'analytics-releases',
      'analytics-retention',
    ]);
    expect(body.executions).toHaveLength(4);
  });

  it('runs a single schedule selected by query string', async () => {
    const response = await POST(
      postRequest(authorized(), undefined, `${CRON_URL}?schedule=analytics-releases`),
    );

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith('analytics-releases', expect.any(String));
  });

  it('runs a single schedule selected by JSON body', async () => {
    const response = await POST(
      postRequest(
        { ...authorized(), 'content-type': 'application/json' },
        JSON.stringify({ schedule: 'analytics-retention' }),
      ),
    );

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith('analytics-retention', expect.any(String));
  });

  it('rejects an unknown schedule without running anything', async () => {
    const response = await POST(
      postRequest(authorized(), undefined, `${CRON_URL}?schedule=analytics-unknown`),
    );
    const body = (await response.json()) as CronBody & { known: string[] };

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_SCHEDULE');
    expect(body.known).toEqual([
      'analytics-traffic',
      'analytics-repo-stats',
      'analytics-releases',
      'analytics-retention',
    ]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body', async () => {
    const response = await POST(
      postRequest({ ...authorized(), 'content-type': 'application/json' }, '{not-json'),
    );

    expect(response.status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('always answers with no-store caching headers', async () => {
    const response = await POST(postRequest(authorized()));

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('POST /api/cron/analytics – failure mapping', () => {
  it('answers 500 and logs an error when a job fails', async () => {
    runMock.mockResolvedValue(result({ ok: false, errorCode: 'UNAVAILABLE' }));

    const response = await POST(
      postRequest(authorized(), undefined, `${CRON_URL}?schedule=analytics-traffic`),
    );
    const body = (await response.json()) as CronBody;

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('JOB_FAILED');
    expect(body.executions[0]).toMatchObject({ ok: false, errorCode: 'UNAVAILABLE' });

    const logged = JSON.parse((console.error as jest.Mock).mock.calls[0][0] as string);
    expect(logged).toMatchObject({
      event: 'analytics.schedule',
      schedule: 'analytics-traffic',
      ok: false,
      errorCode: 'UNAVAILABLE',
      level: 'error',
    });
  });

  it('answers 409 when the schedule is already locked by another run', async () => {
    runMock.mockResolvedValue(result({ ok: false, errorCode: 'LOCKED' }));

    const response = await POST(
      postRequest(authorized(), undefined, `${CRON_URL}?schedule=analytics-traffic`),
    );

    expect(response.status).toBe(409);
    expect((await response.json()) as CronBody).toMatchObject({ error: 'ALREADY_RUNNING' });
  });

  it('answers 500 with EXECUTION_FAILED when the job throws', async () => {
    runMock.mockRejectedValue(new Error('upstream exploded'));

    const response = await POST(
      postRequest(authorized(), undefined, `${CRON_URL}?schedule=analytics-traffic`),
    );
    const body = (await response.json()) as CronBody;

    expect(response.status).toBe(500);
    expect(body.executions[0]).toMatchObject({ ok: false, errorCode: 'EXECUTION_FAILED' });
    // The thrown message must not be echoed to the caller.
    expect(JSON.stringify(body)).not.toMatch(/upstream exploded/);
  });

  it('rejects a second concurrent run of the same schedule with 409', async () => {
    let release: ((value: AnalyticsScheduleResult) => void) | undefined;
    runMock.mockImplementation(
      () =>
        new Promise<AnalyticsScheduleResult>((resolve) => {
          release = resolve;
        }),
    );

    const url = `${CRON_URL}?schedule=analytics-traffic`;
    const first = POST(postRequest(authorized(), undefined, url));

    // Wait until the first request is inside the runner (bounded, so a
    // regression fails instead of hanging).
    for (let tick = 0; tick < 50 && runMock.mock.calls.length === 0; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(runMock).toHaveBeenCalledTimes(1);

    const second = await POST(postRequest(authorized(), undefined, url));
    expect(second.status).toBe(409);
    expect((await second.json()) as CronBody).toMatchObject({ error: 'ALREADY_RUNNING' });

    expect(release).toBeDefined();
    release?.(result());
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);

    // The guard must be released afterwards, so a later run is accepted again.
    runMock.mockResolvedValue(result());
    const later = await POST(postRequest(authorized(), undefined, url));
    expect(later.status).toBe(200);
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/cron/analytics', () => {
  it('answers 405 with an Allow header and never runs a job', () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(runMock).not.toHaveBeenCalled();
  });
});
