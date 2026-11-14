/**
 * @jest-environment node
 *
 * Repository statistics sync: metadata, weekly buckets, snapshots and the
 * 202/204/422 states GitHub uses for freshly computed statistics.
 */
import { syncGitHubRepoStats } from '../analytics/github-repo-stats';
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
  type Store = Row[];

  const stores: Record<string, Store> = {
    metadata: [],
    commit: [],
    contributors: [],
    codeFrequency: [],
    participation: [],
    punchCard: [],
  };

  const normalize = (value: unknown) =>
    value !== null && typeof value === 'object' ? String(value) : value;

  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => normalize(row[key]) === normalize(value));

  const makeModel = (store: Store, prefix: string) => ({
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
  });

  const orm = {
    public: {
      GitHubRepoStatsSnapshot: makeModel(stores.metadata, 'meta'),
      GitHubCommitActivityWeek: makeModel(stores.commit, 'commit'),
      GitHubContributorSnapshot: makeModel(stores.contributors, 'contrib'),
      GitHubCodeFrequencyWeek: makeModel(stores.codeFrequency, 'code'),
      GitHubParticipationWeek: makeModel(stores.participation, 'part'),
      GitHubPunchCardSlot: makeModel(stores.punchCard, 'punch'),
    },
  };

  return {
    __repoStatsState: stores,
    db: {
      orm,
      transaction: async (fn: (tx: { orm: typeof orm }) => Promise<unknown>) => fn({ orm }),
    },
  };
});

const stores = (
  dbModule as unknown as {
    __repoStatsState: Record<string, Record<string, unknown>[]>;
  }
).__repoStatsState;

const getToken = githubApp.getInstallationAccessToken as jest.MockedFunction<
  typeof githubApp.getInstallationAccessToken
>;

const WEEK = 1762560000;

const metadata = {
  full_name: 'YourEliteSystems/WebRadio',
  stargazers_count: 120,
  forks_count: 8,
  subscribers_count: 5,
  watchers_count: 130,
  open_issues_count: 3,
  language: 'TypeScript',
  license: { spdx_id: 'MIT', name: 'MIT License' },
  topics: ['radio', 'desktop'],
};

const payloads: Record<string, unknown> = {
  metadata,
  commit_activity: [{ total: 4, week: WEEK, days: [1, 1, 1, 1, 0, 0, 0] }],
  contributors: [
    { author: { login: 'alice' }, total: 42 },
    { author: null, total: 9 },
  ],
  code_frequency: [[WEEK, 100, -40]],
  participation: { all: Array<number>(52).fill(2), owner: Array<number>(52).fill(1) },
  punch_card: [[1, 12, 7]],
};

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

function installFetch(overrides: Record<string, Reply> = {}) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(payloads).find((candidate) => {
      if (candidate === 'metadata') return /\/WebRadio$/.test(url);
      return url.includes(`/stats/${candidate}`);
    });
    const reply = (key && overrides[key]) || { status: 200, body: key ? payloads[key] : {} };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.headers ?? {},
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  for (const store of Object.values(stores)) store.length = 0;
  getToken.mockResolvedValue({ token: 'installation-token' } as never);
});

describe('syncGitHubRepoStats', () => {
  it('stores metadata, weekly buckets and snapshots', async () => {
    installFetch();

    const result = await syncGitHubRepoStats(new Date('2026-11-14T12:00:00Z'));

    expect(result.success).toBe(true);
    expect(result.results.every((entry) => entry.outcome === 'OK')).toBe(true);

    expect(stores.metadata).toHaveLength(1);
    expect(stores.metadata[0]).toMatchObject({
      stars: 120,
      forks: 8,
      watchers: 5,
      openIssues: 3,
      language: 'TypeScript',
      license: 'MIT',
      topics: JSON.stringify(['radio', 'desktop']),
    });

    expect(stores.commit).toHaveLength(1);
    expect(stores.commit[0]).toMatchObject({ total: 4, daysJson: JSON.stringify([1, 1, 1, 1, 0, 0, 0]) });
    expect(String(stores.commit[0].weekStart)).toBe('2025-11-08T00:00:00Z');

    expect(stores.contributors).toHaveLength(1);
    expect(stores.contributors[0]).toMatchObject({ login: 'alice', contributions: 42 });

    expect(stores.codeFrequency[0]).toMatchObject({ additions: 100, deletions: 40 });

    expect(stores.participation).toHaveLength(52);
    expect(stores.participation[51]).toMatchObject({ allCount: 2, ownerCount: 1 });

    expect(stores.punchCard[0]).toMatchObject({ weekday: 1, hour: 12, count: 7 });
  });

  it('treats 202 as PENDING without storing and without failing the run', async () => {
    installFetch({ commit_activity: { status: 202 } });

    const result = await syncGitHubRepoStats(new Date('2026-11-14T12:00:00Z'));

    expect(result.success).toBe(true);
    expect(result.results.find((entry) => entry.source === 'commit_activity')).toMatchObject({
      outcome: 'PENDING',
      httpStatus: 202,
      itemCount: 0,
    });
    expect(stores.commit).toHaveLength(0);
    expect(stores.metadata).toHaveLength(1);
  });

  it('treats 204 as EMPTY and 422 as UNSUPPORTED', async () => {
    installFetch({ participation: { status: 204 }, punch_card: { status: 422 } });

    const result = await syncGitHubRepoStats(new Date('2026-11-14T12:00:00Z'));

    expect(result.success).toBe(true);
    expect(result.results.find((entry) => entry.source === 'participation')?.outcome).toBe('EMPTY');
    expect(result.results.find((entry) => entry.source === 'punch_card')?.outcome).toBe('UNSUPPORTED');
  });

  it('reports a 403 as PERMISSION_DENIED and keeps other sources stored', async () => {
    installFetch({ metadata: { status: 403, body: { message: 'Resource not accessible by integration' } } });

    const result = await syncGitHubRepoStats(new Date('2026-11-14T12:00:00Z'));

    expect(result.success).toBe(false);
    expect(result.results.find((entry) => entry.source === 'metadata')).toMatchObject({
      outcome: 'PERMISSION_DENIED',
      httpStatus: 403,
    });
    expect(stores.metadata).toHaveLength(0);
    expect(stores.commit).toHaveLength(1);
  });

  it('reports exhausted rate limits as RATE_LIMITED', async () => {
    installFetch({
      metadata: { status: 429, body: { message: 'slow down' }, headers: { 'retry-after': '60' } },
    });

    const result = await syncGitHubRepoStats(new Date('2026-11-14T12:00:00Z'));

    expect(result.results.find((entry) => entry.source === 'metadata')).toMatchObject({
      outcome: 'RATE_LIMITED',
      httpStatus: 429,
    });
  });

  it('rejects metadata for another repository', async () => {
    installFetch({
      metadata: { status: 200, body: { ...metadata, full_name: 'SomeoneElse/WebRadio' } },
    });

    const result = await syncGitHubRepoStats(new Date('2026-11-14T12:00:00Z'));

    expect(result.results.find((entry) => entry.source === 'metadata')?.outcome).toBe('INVALID_RESPONSE');
    expect(stores.metadata).toHaveLength(0);
  });
});
