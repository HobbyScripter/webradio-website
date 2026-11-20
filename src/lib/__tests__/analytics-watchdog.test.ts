/**
 * @jest-environment node
 *
 * Watchdog: stale sources, orphaned RUNNING runs, the closing GitHub traffic
 * window, and exactly one mail per incident. Database and mail are mocked.
 */
import 'temporal-polyfill/global';
import { runAnalyticsWatchdog } from '../analytics/watchdog';
import * as dbModule from '@/lib/db';
import * as email from '@/lib/email';

jest.mock('@/lib/email', () => ({ sendTransactionalEmail: jest.fn() }));

jest.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;
  const state = {
    statuses: [] as Row[],
    runs: [] as Row[],
    trafficDays: [] as Row[],
    failStatuses: false,
  };

  const runWhere = (where: Row) => ({
    all: async () => state.runs.filter((row) => row.status === where.status),
    update: async (data: Row) => {
      const row = state.runs.find((candidate) => candidate.id === where.id);
      if (row) Object.assign(row, data);
    },
  });

  return {
    __watchdogState: state,
    db: {
      orm: {
        public: {
          AnalyticsSourceStatus: {
            all: async () => {
              if (state.failStatuses) throw new Error('database unavailable');
              return state.statuses;
            },
          },
          AnalyticsSyncRun: { where: runWhere },
          GitHubTrafficDaily: {
            orderBy: () => ({ limit: () => ({ all: async () => state.trafficDays }) }),
          },
        },
      },
    },
  };
});

const state = (
  dbModule as unknown as {
    __watchdogState: {
      statuses: Record<string, unknown>[];
      runs: Record<string, unknown>[];
      trafficDays: Record<string, unknown>[];
      failStatuses: boolean;
    };
  }
).__watchdogState;

const emailMock = email.sendTransactionalEmail as jest.MockedFunction<
  typeof email.sendTransactionalEmail
>;

const NOW = Temporal.Instant.from('2026-11-20T05:15:00Z');
/** Stored traffic days are date-only values; the watchdog runs in the morning. */
const DAY_START = Temporal.Instant.from('2026-11-20T00:00:00Z');
const RECIPIENT = 'ops@example.com';

function status(source: string, lastSuccessAt: Temporal.Instant | null) {
  state.statuses.push({ id: `status-${source}`, source, status: 'SUCCESS', lastSuccessAt });
}

beforeEach(() => {
  state.statuses.length = 0;
  state.runs.length = 0;
  state.trafficDays.length = 0;
  state.failStatuses = false;
  // Fresh traffic by default: it must not add findings to unrelated tests.
  state.trafficDays.push({ id: 'traffic-1', day: NOW.subtract({ hours: 6 }) });
  emailMock.mockReset();
  emailMock.mockResolvedValue({ delivered: true, mode: 'smtp' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('stale sources', () => {
  it('mails an overdue source exactly once per incident', async () => {
    status('TRAFFIC_VIEWS', NOW.subtract({ hours: 30 }));

    const first = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(first.findings).toEqual([
      expect.objectContaining({
        key: 'source:TRAFFIC_VIEWS',
        kind: 'SOURCE_STALE',
        severity: 'warning',
        notified: true,
      }),
    ]);
    expect(first.notification).toMatchObject({ delivered: true, mode: 'smtp' });
    expect(first.ok).toBe(true);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(emailMock.mock.calls[0]?.[0].to).toBe(RECIPIENT);

    const nextDay = await runAnalyticsWatchdog({
      now: NOW.add({ hours: 24 }),
      alertRecipient: RECIPIENT,
    });

    // Still reported, but the incident is no longer new: no second mail.
    expect(nextDay.findings).toHaveLength(1);
    expect(nextDay.findings[0]?.notified).toBe(false);
    expect(nextDay.notification).toBeNull();
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('stays silent while a source is only slightly late', async () => {
    status('TRAFFIC_VIEWS', NOW.subtract({ hours: 20 }));

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.findings).toEqual([]);
    expect(result.notification).toBeNull();
    expect(emailMock).not.toHaveBeenCalled();
  });

  it('escalates to critical after two missed days', async () => {
    status('REPO_METADATA', NOW.subtract({ hours: 60 }));

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    // The escalation is its own incident: still inside the alert window.
    expect(result.findings[0]).toMatchObject({ severity: 'critical', notified: true });
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('does not repeat the escalation on the next day', async () => {
    status('REPO_METADATA', NOW.subtract({ hours: 60 }));

    await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });
    const nextDay = await runAnalyticsWatchdog({
      now: NOW.add({ hours: 24 }),
      alertRecipient: RECIPIENT,
    });

    expect(nextDay.findings[0]).toMatchObject({ severity: 'critical', notified: false });
    expect(nextDay.notification).toBeNull();
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a source that never succeeded', async () => {
    status('CONTRIBUTORS', null);

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.findings).toEqual([]);
    expect(emailMock).not.toHaveBeenCalled();
  });
});

describe('traffic window', () => {
  it('warns while the missing days can still be fetched', async () => {
    state.trafficDays[0] = { id: 'traffic-1', day: DAY_START.subtract({ hours: 10 * 24 }) };

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.findings).toEqual([
      expect.objectContaining({
        key: 'traffic:WINDOW:warning',
        kind: 'TRAFFIC_WINDOW',
        severity: 'warning',
        notified: true,
      }),
    ]);
    expect(result.findings[0]?.detail).toContain('4 Tag(e)');
  });

  it('warns only once on consecutive days', async () => {
    state.trafficDays[0] = { id: 'traffic-1', day: DAY_START.subtract({ hours: 10 * 24 }) };

    await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });
    const nextDay = await runAnalyticsWatchdog({
      now: NOW.add({ hours: 24 }),
      alertRecipient: RECIPIENT,
    });

    expect(nextDay.findings[0]).toMatchObject({ severity: 'warning', notified: false });
    expect(nextDay.notification).toBeNull();
    expect(emailMock).toHaveBeenCalledTimes(1);
  });

  it('escalates when only one day is left', async () => {
    state.trafficDays[0] = { id: 'traffic-1', day: DAY_START.subtract({ hours: 13 * 24 }) };

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.findings[0]).toMatchObject({
      key: 'traffic:WINDOW:critical',
      severity: 'critical',
      notified: true,
    });
  });

  it('does not warn on fresh traffic', async () => {
    state.trafficDays[0] = { id: 'traffic-1', day: DAY_START.subtract({ hours: 9 * 24 }) };

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.findings).toEqual([]);
  });

  it('reports a store without any traffic day at all', async () => {
    state.trafficDays.length = 0;

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.findings).toEqual([
      expect.objectContaining({ key: 'traffic:WINDOW:missing', severity: 'critical' }),
    ]);
  });
});

describe('orphaned runs', () => {
  it('closes a run that outlived the lock and the function limit', async () => {
    state.runs.push({
      id: 'run-9',
      source: 'RELEASES',
      status: 'RUNNING',
      startedAt: NOW.subtract({ minutes: 40 }),
    });

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.orphanedRunsRepaired).toBe(1);
    expect(result.findings).toEqual([
      expect.objectContaining({ key: 'run:run-9', kind: 'ORPHANED_RUN', notified: true }),
    ]);
    expect(state.runs[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'ORPHANED',
      completedAt: NOW,
    });
  });

  it('leaves a run alone while it could still be working', async () => {
    state.runs.push({
      id: 'run-10',
      source: 'TRAFFIC_VIEWS',
      status: 'RUNNING',
      startedAt: NOW.subtract({ minutes: 5 }),
    });

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.orphanedRunsRepaired).toBe(0);
    expect(result.findings).toEqual([]);
    expect(state.runs[0]).toMatchObject({ status: 'RUNNING' });
  });

  it('does not report the same orphan again after repairing it', async () => {
    state.runs.push({
      id: 'run-11',
      source: 'RELEASES',
      status: 'RUNNING',
      startedAt: NOW.subtract({ minutes: 40 }),
    });

    await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });
    const second = await runAnalyticsWatchdog({
      now: NOW.add({ minutes: 1 }),
      alertRecipient: RECIPIENT,
    });

    expect(second.orphanedRunsRepaired).toBe(0);
    expect(second.findings).toEqual([]);
    expect(emailMock).toHaveBeenCalledTimes(1);
  });
});

describe('reporting', () => {
  it('fails the run when the alert cannot be delivered', async () => {
    status('TRAFFIC_VIEWS', NOW.subtract({ hours: 50 }));
    emailMock.mockResolvedValue({
      delivered: false,
      mode: 'unconfigured',
      failure: 'not_configured',
    });

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('NOTIFICATION_FAILED');
    expect(result.notification).toMatchObject({ delivered: false, failure: 'not_configured' });
    expect(result.findings[0]?.notified).toBe(false);
  });

  it('does not touch the mail path when everything is healthy', async () => {
    status('TRAFFIC_VIEWS', NOW.subtract({ hours: 2 }));

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.ok).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.checkedSources).toBe(1);
    expect(emailMock).not.toHaveBeenCalled();
  });

  it('fails the run when the database cannot be read', async () => {
    state.failStatuses = true;

    const result = await runAnalyticsWatchdog({ now: NOW, alertRecipient: RECIPIENT });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('WATCHDOG_FAILED');
    expect(result.notification).toBeNull();
    expect(emailMock).not.toHaveBeenCalled();
  });
});
