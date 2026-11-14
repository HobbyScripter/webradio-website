/**
 * @jest-environment node
 *
 * GitHub traffic sync: daily archiving, idempotent updates and per-source
 * error isolation. The DB and the GitHub App token are mocked.
 */
import { syncGitHubTraffic, utcDayStart } from '../analytics/github-traffic';
import * as dbModule from '@/lib/db';
import * as githubApp from '@/lib/github-app';

jest.mock('@/lib/github-app', () => ({
  GITHUB_REPOSITORY: 'YourEliteSystems/WebRadio',
  githubApiHeaders: () => ({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'test',
    'X-GitHub-Api-Version': '2022-11-28',
  }),
  getInstallationAccessToken: jest.fn(),
}));

jest.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;

  const state: {
    days: Row[];
    referrers: Row[];
    paths: Row[];
  } = { days: [], referrers: [], paths: [] };

  const normalize = (value: unknown) =>
    value !== null && typeof value === 'object' ? String(value) : value;
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(
      ([key, value]) => normalize(row[key]) === normalize(value),
    );

  const makeModel = (store: Row[], prefix: string) => ({
    first: async (where: Row) => store.find((row) => matches(row, where)) ?? null,
    create: async (data: Row) => {
      const row = { id: `${prefix}-${store.length + 1}`, ...data };
      store.push(row);
      return row;
    },
    where: (where: Row) => ({
      update: async (data: Row) => {
        const row = store.find((candidate) => matches(candidate, where));
        if (!row) throw new Error('row not found');
        Object.assign(row, data);
      },
      deleteAll: async () => {
        for (let index = store.length - 1; index >= 0; index -= 1) {
          if (matches(store[index], where)) store.splice(index, 1);
        }
      },
    }),
    all: async () => [...store],
  });

  const orm = {
    public: {
      GitHubTrafficDaily: makeModel(state.days, 'day'),
      GitHubTrafficReferrerSnapshot: makeModel(state.referrers, 'ref'),
      GitHubTrafficPathSnapshot: makeModel(state.paths, 'path'),
    },
  };

  return {
    __trafficState: state,
    db: {
      orm,
      transaction: async (fn: (tx: { orm: typeof orm }) => Promise<unknown>) => fn({ orm }),
    },
  };
});

const state = (
  dbModule as unknown as {
    __trafficState: { days: Record<string, unknown>[]; referrers: Record<string, unknown>[]; paths: Record<string, unknown>[] };
  }
).__trafficState;

const getToken = githubApp.getInstallationAccessToken as jest.MockedFunction<
  typeof githubApp.getInstallationAccessToken
>;

const TODAY = '2026-11-14';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function viewsBody(days: { timestamp: string; count: number; uniques: number }[]) {
  return {
    count: days.reduce((sum, day) => sum + day.count, 0),
    uniques: days.reduce((sum, day) => sum + day.uniques, 0),
    views: days,
  };
}

function clonesBody(days: { timestamp: string; count: number; uniques: number }[]) {
  return {
    count: days.reduce((sum, day) => sum + day.count, 0),
    uniques: days.reduce((sum, day) => sum + day.uniques, 0),
    clones: days,
  };
}

function installFetch(handlers: {
  views?: () => Response | Promise<Response>;
  clones?: () => Response | Promise<Response>;
  referrers?: () => Response | Promise<Response>;
  paths?: () => Response | Promise<Response>;
}) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/traffic/views')) return handlers.views?.() ?? jsonResponse(viewsBody([]));
    if (url.includes('/traffic/clones')) return handlers.clones?.() ?? jsonResponse(clonesBody([]));
    if (url.includes('/traffic/popular/referrers')) return handlers.referrers?.() ?? jsonResponse([]);
    if (url.includes('/traffic/popular/paths')) return handlers.paths?.() ?? jsonResponse([]);
    return jsonResponse({}, { status: 404 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  state.days.length = 0;
  state.referrers.length = 0;
  state.paths.length = 0;
  getToken.mockResolvedValue({ token: 'installation-token' } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('utcDayStart', () => {
  it('normalizes any timestamp to UTC midnight', () => {
    expect(utcDayStart('2026-11-14T23:59:59Z').toString()).toBe('2026-11-14T00:00:00Z');
  });

  it('rejects an invalid timestamp', () => {
    expect(() => utcDayStart('not-a-date')).toThrow(/Zeitstempel/);
  });
});

describe('syncGitHubTraffic', () => {
  it('stores 14 daily buckets once and merges views and clones per day', async () => {
    const days = Array.from({ length: 14 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(),
      count: 10 + index,
      uniques: 3 + index,
    }));

    installFetch({
      views: () => jsonResponse(viewsBody(days)),
      clones: () => jsonResponse(clonesBody(days.map((day) => ({ ...day, count: day.count + 100 })))),
      referrers: () =>
        jsonResponse([
          { referrer: 'github.com', count: 12, uniques: 7 },
          { referrer: 'google.com', count: 5, uniques: 4 },
        ]),
      paths: () =>
        jsonResponse([{ path: '/YourEliteSystems/WebRadio', title: 'WebRadio', count: 9, uniques: 6 }]),
    });

    const result = await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));

    expect(result).toEqual({
      success: true,
      daysStored: 14,
      referrersStored: 2,
      pathsStored: 1,
      errors: [],
    });
    expect(state.days).toHaveLength(14);
    expect(state.days[0]).toMatchObject({ views: 10, uniqueVisitors: 3, clones: 110, uniqueClones: 3 });
    expect(state.referrers).toHaveLength(2);
    expect(state.paths).toHaveLength(1);
  });

  it('updates corrected values without duplicating days', async () => {
    installFetch({
      views: () =>
        jsonResponse(viewsBody([{ timestamp: `${TODAY}T00:00:00Z`, count: 10, uniques: 4 }])),
      clones: () =>
        jsonResponse(clonesBody([{ timestamp: `${TODAY}T00:00:00Z`, count: 2, uniques: 1 }])),
    });

    await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));
    installFetch({
      views: () =>
        jsonResponse(viewsBody([{ timestamp: `${TODAY}T00:00:00Z`, count: 17, uniques: 9 }])),
      clones: () =>
        jsonResponse(clonesBody([{ timestamp: `${TODAY}T00:00:00Z`, count: 3, uniques: 2 }])),
    });
    const second = await syncGitHubTraffic(new Date(`${TODAY}T18:00:00Z`));

    expect(second.success).toBe(true);
    expect(state.days).toHaveLength(1);
    expect(state.days[0]).toMatchObject({ views: 17, uniqueVisitors: 9, clones: 3, uniqueClones: 2 });
  });

  it('replaces only the current day snapshot for referrers and paths', async () => {
    installFetch({
      referrers: () => jsonResponse([{ referrer: 'github.com', count: 12, uniques: 7 }]),
      paths: () => jsonResponse([{ path: '/a', count: 1, uniques: 1 }]),
    });
    await syncGitHubTraffic(new Date(`${TODAY}T08:00:00Z`));

    installFetch({
      referrers: () => jsonResponse([{ referrer: 'google.com', count: 3, uniques: 2 }]),
      paths: () => jsonResponse([{ path: '/b', count: 4, uniques: 2 }]),
    });
    await syncGitHubTraffic(new Date(`${TODAY}T20:00:00Z`));

    expect(state.referrers).toHaveLength(1);
    expect(state.referrers[0]).toMatchObject({ referrer: 'google.com' });
    expect(state.paths).toHaveLength(1);
    expect(state.paths[0]).toMatchObject({ path: '/b' });
  });

  it('keeps stored clone values when only the clones request fails', async () => {
    state.days.push({
      id: 'existing',
      day: `${TODAY}T00:00:00Z`,
      views: 1,
      uniqueVisitors: 1,
      clones: 7,
      uniqueClones: 3,
    });

    installFetch({
      views: () =>
        jsonResponse(viewsBody([{ timestamp: `${TODAY}T00:00:00Z`, count: 11, uniques: 6 }])),
      clones: () => jsonResponse({ message: 'boom' }, { status: 500 }),
    });

    const result = await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ source: 'clones', code: 'UNAVAILABLE', status: 500 }]);
    expect(state.days).toHaveLength(1);
    expect(state.days[0]).toMatchObject({ views: 11, uniqueVisitors: 6, clones: 7, uniqueClones: 3 });
  });

  it('maps a 403 without exhausted rate limit to PERMISSION_DENIED', async () => {
    installFetch({
      views: () => jsonResponse({ message: 'Resource not accessible by integration' }, { status: 403 }),
    });

    const result = await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));

    expect(result.success).toBe(false);
    expect(result.errors[0]).toEqual({ source: 'views', code: 'PERMISSION_DENIED', status: 403 });
    expect(state.days).toHaveLength(0);
  });

  it('maps 403 with exhausted rate limit and 429 to RATE_LIMITED', async () => {
    installFetch({
      views: () =>
        jsonResponse({ message: 'rate limit' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
      clones: () => jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '30' } }),
    });

    const result = await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));

    expect(result.errors).toEqual(
      expect.arrayContaining([
        { source: 'views', code: 'RATE_LIMITED', status: 403 },
        { source: 'clones', code: 'RATE_LIMITED', status: 429 },
      ]),
    );
  });

  it('rejects invalid response shapes without writing', async () => {
    installFetch({
      views: () => jsonResponse({ views: 'not-an-array' }),
      clones: () => jsonResponse({ clones: [{ timestamp: 'x', count: -1, uniques: 0 }] }),
    });

    const result = await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));

    expect(result.errors).toEqual(
      expect.arrayContaining([
        { source: 'views', code: 'INVALID_RESPONSE', status: null },
        { source: 'clones', code: 'INVALID_RESPONSE', status: null },
      ]),
    );
    expect(state.days).toHaveLength(0);
  });

  it('reports NOT_CONFIGURED when no installation token is available', async () => {
    getToken.mockResolvedValue({ token: null } as never);
    installFetch({});

    const result = await syncGitHubTraffic(new Date(`${TODAY}T12:00:00Z`));

    expect(result.success).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual([
      'NOT_CONFIGURED',
      'NOT_CONFIGURED',
      'NOT_CONFIGURED',
      'NOT_CONFIGURED',
    ]);
  });
});
