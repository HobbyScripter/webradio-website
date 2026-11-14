import 'temporal-polyfill/global';
import { z } from 'zod';
import type * as DbModule from '../db';
import { GITHUB_REPOSITORY, getInstallationAccessToken, githubApiHeaders } from '../github-app';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('../db');
  return mod.db;
}

const GITHUB_API_BASE = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CONTRIBUTORS = 100;
const PARTICIPATION_WEEKS = 52;

export type RepoStatsSource =
  | 'metadata'
  | 'commit_activity'
  | 'contributors'
  | 'code_frequency'
  | 'participation'
  | 'punch_card';

export type RepoStatsFailureCode =
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NOT_CONFIGURED';

export type RepoStatsOutcome = 'OK' | 'PENDING' | 'EMPTY' | 'UNSUPPORTED' | RepoStatsFailureCode;

export type RepoStatsSourceResult = {
  source: RepoStatsSource;
  outcome: RepoStatsOutcome;
  httpStatus: number | null;
  itemCount: number;
};

export type RepoStatsSyncResult = {
  success: boolean;
  results: RepoStatsSourceResult[];
};

export class GitHubRepoStatsError extends Error {
  readonly code: RepoStatsFailureCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: RepoStatsFailureCode,
    message: string,
    options: { status?: number | null; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = 'GitHubRepoStatsError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

const nonNegativeInt = z.number().int().nonnegative();

const metadataSchema = z.object({
  full_name: z.string(),
  stargazers_count: nonNegativeInt,
  forks_count: nonNegativeInt,
  subscribers_count: nonNegativeInt.optional(),
  watchers_count: nonNegativeInt,
  open_issues_count: nonNegativeInt,
  language: z.string().nullable().optional(),
  license: z
    .object({
      spdx_id: z.string().nullable().optional(),
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
  topics: z.array(z.string()).optional(),
});

const commitActivitySchema = z.array(
  z.object({
    total: nonNegativeInt,
    week: z.number().int(),
    days: z.array(nonNegativeInt).length(7),
  }),
);

const contributorsSchema = z.array(
  z.object({
    author: z.object({ login: z.string().min(1) }).nullable().optional(),
    total: nonNegativeInt,
  }),
);

const codeFrequencySchema = z.array(z.tuple([z.number().int(), z.number().int(), z.number().int()]));

const participationSchema = z.object({
  all: z.array(nonNegativeInt),
  owner: z.array(nonNegativeInt),
});

const punchCardSchema = z.array(
  z.tuple([
    z.number().int().min(0).max(6),
    z.number().int().min(0).max(23),
    nonNegativeInt,
  ]),
);

type Fetched<T> =
  | { kind: 'json'; httpStatus: 200; data: T }
  | { kind: 'pending'; httpStatus: 202 }
  | { kind: 'empty'; httpStatus: 204 }
  | { kind: 'unsupported'; httpStatus: 422 };

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function requestStats<T>(pathname: string, schema: z.ZodType<T>): Promise<Fetched<T>> {
  const auth = await getInstallationAccessToken();
  if (!auth.token) {
    throw new GitHubRepoStatsError(
      'NOT_CONFIGURED',
      'Keine GitHub-App-Installation konfiguriert; Statistiken können nicht gelesen werden.',
    );
  }

  let response: Response;
  try {
    const suffix = pathname ? `/${pathname}` : '';
    response = await fetch(`${GITHUB_API_BASE}/repos/${GITHUB_REPOSITORY}${suffix}`, {
      headers: { ...githubApiHeaders(), Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new GitHubRepoStatsError('UNAVAILABLE', 'GitHub Statistics API ist nicht erreichbar.');
  }

  if (response.status === 202) return { kind: 'pending', httpStatus: 202 };
  if (response.status === 204) return { kind: 'empty', httpStatus: 204 };
  if (response.status === 422) return { kind: 'unsupported', httpStatus: 422 };

  if (!response.ok) {
    const rateLimited =
      response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
    if (rateLimited) {
      throw new GitHubRepoStatsError('RATE_LIMITED', 'GitHub Rate-Limit für Statistiken erreicht.', {
        status: response.status,
        retryAfterSeconds: retryAfterSeconds(response),
      });
    }
    if (response.status === 403) {
      throw new GitHubRepoStatsError(
        'PERMISSION_DENIED',
        'Der GitHub App fehlt die Berechtigung für Repository-Statistiken.',
        { status: 403 },
      );
    }
    if (response.status === 404) {
      throw new GitHubRepoStatsError('NOT_FOUND', 'Repository für Statistiken nicht gefunden.', {
        status: 404,
      });
    }
    throw new GitHubRepoStatsError('UNAVAILABLE', `GitHub Statistics API antwortete mit ${response.status}.`, {
      status: response.status,
    });
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new GitHubRepoStatsError('INVALID_RESPONSE', 'GitHub Statistics API lieferte kein gültiges JSON.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new GitHubRepoStatsError('INVALID_RESPONSE', 'Ungültiges Antwortformat der GitHub Statistics API.');
  }
  return { kind: 'json', httpStatus: 200, data: parsed.data };
}

function utcDayFromEpochSeconds(seconds: number): Temporal.Instant {
  return Temporal.Instant.from(new Date(seconds * 1000).toISOString())
    .toZonedDateTimeISO('UTC')
    .startOfDay()
    .toInstant();
}

/** Monday 00:00 UTC of the week containing `now`. */
function currentWeekStart(now: Temporal.Instant): Temporal.Instant {
  const date = now.toZonedDateTimeISO('UTC').toPlainDate();
  const daysSinceMonday = (date.dayOfWeek + 6) % 7;
  return date
    .subtract({ days: daysSinceMonday })
    .toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('00:00') })
    .toInstant();
}

async function storeMetadata(
  capturedFor: Temporal.Instant,
  data: z.infer<typeof metadataSchema>,
): Promise<number> {
  if (data.full_name.toLowerCase() !== GITHUB_REPOSITORY.toLowerCase()) {
    throw new GitHubRepoStatsError(
      'INVALID_RESPONSE',
      'GitHub lieferte Metadaten für ein anderes Repository.',
    );
  }

  const db = await getDb();
  const values = {
    stars: data.stargazers_count,
    forks: data.forks_count,
    watchers: data.subscribers_count ?? data.watchers_count,
    openIssues: data.open_issues_count,
    language: data.language ?? null,
    license: data.license?.spdx_id ?? data.license?.name ?? null,
    topics: data.topics?.length ? JSON.stringify(data.topics) : null,
  };

  const existing = await db.orm.public.GitHubRepoStatsSnapshot.first({ capturedFor });
  if (existing) {
    await db.orm.public.GitHubRepoStatsSnapshot.where({ id: existing.id }).update(values);
  } else {
    await db.orm.public.GitHubRepoStatsSnapshot.create({ capturedFor, ...values });
  }
  return 1;
}

async function storeCommitActivity(data: z.infer<typeof commitActivitySchema>): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const week of data) {
      const weekStart = utcDayFromEpochSeconds(week.week);
      const values = { total: week.total, daysJson: JSON.stringify(week.days) };
      const existing = await tx.orm.public.GitHubCommitActivityWeek.first({ weekStart });
      if (existing) {
        await tx.orm.public.GitHubCommitActivityWeek.where({ id: existing.id }).update(values);
      } else {
        await tx.orm.public.GitHubCommitActivityWeek.create({ weekStart, ...values });
      }
    }
  });
  return data.length;
}

async function replaceContributors(
  capturedFor: Temporal.Instant,
  data: z.infer<typeof contributorsSchema>,
): Promise<number> {
  const rows = data
    .filter((entry): entry is { author: { login: string }; total: number } => Boolean(entry.author))
    .slice(0, MAX_CONTRIBUTORS);

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.orm.public.GitHubContributorSnapshot.where({ capturedFor }).deleteAll();
    for (const row of rows) {
      await tx.orm.public.GitHubContributorSnapshot.create({
        capturedFor,
        login: row.author.login,
        contributions: row.total,
      });
    }
  });
  return rows.length;
}

async function storeCodeFrequency(data: z.infer<typeof codeFrequencySchema>): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [week, additions, deletions] of data) {
      const weekStart = utcDayFromEpochSeconds(week);
      const values = {
        additions: Math.max(0, additions),
        deletions: Math.max(0, Math.abs(deletions)),
      };
      const existing = await tx.orm.public.GitHubCodeFrequencyWeek.first({ weekStart });
      if (existing) {
        await tx.orm.public.GitHubCodeFrequencyWeek.where({ id: existing.id }).update(values);
      } else {
        await tx.orm.public.GitHubCodeFrequencyWeek.create({ weekStart, ...values });
      }
    }
  });
  return data.length;
}

async function storeParticipation(
  now: Temporal.Instant,
  data: z.infer<typeof participationSchema>,
): Promise<number> {
  const latestWeek = currentWeekStart(now);
  const count = Math.min(data.all.length, data.owner.length, PARTICIPATION_WEEKS);
  const db = await getDb();

  await db.transaction(async (tx) => {
    for (let index = 0; index < count; index += 1) {
      // Instant arithmetic only accepts time units; a week is therefore 168 hours.
      const weekStart = latestWeek.subtract({ hours: (count - 1 - index) * 7 * 24 });
      const values = {
        allCount: data.all[index] ?? 0,
        ownerCount: data.owner[index] ?? 0,
      };
      const existing = await tx.orm.public.GitHubParticipationWeek.first({ weekStart });
      if (existing) {
        await tx.orm.public.GitHubParticipationWeek.where({ id: existing.id }).update(values);
      } else {
        await tx.orm.public.GitHubParticipationWeek.create({ weekStart, ...values });
      }
    }
  });
  return count;
}

async function storePunchCard(data: z.infer<typeof punchCardSchema>): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [weekday, hour, count] of data) {
      const existing = await tx.orm.public.GitHubPunchCardSlot.first({ weekday, hour });
      if (existing) {
        await tx.orm.public.GitHubPunchCardSlot.where({ id: existing.id }).update({ count });
      } else {
        await tx.orm.public.GitHubPunchCardSlot.create({ weekday, hour, count });
      }
    }
  });
  return data.length;
}

function failureOutcome(error: unknown): { outcome: RepoStatsOutcome; httpStatus: number | null } {
  if (error instanceof GitHubRepoStatsError) {
    return { outcome: error.code, httpStatus: error.status };
  }
  return { outcome: 'UNAVAILABLE', httpStatus: null };
}

/**
 * Reads repository metadata and the five statistics endpoints.
 *
 * GitHub answers `202` while a statistic is still being computed; that is a
 * valid PENDING state and is never retried inside the same run. `204` means the
 * repository has no data yet (EMPTY), `422` means the statistic is not available
 * for this repository (UNSUPPORTED). Only real failures count as failure.
 */
export async function syncGitHubRepoStats(now: Date = new Date()): Promise<RepoStatsSyncResult> {
  const nowInstant = Temporal.Instant.from(now.toISOString());
  const capturedFor = nowInstant.toZonedDateTimeISO('UTC').startOfDay().toInstant();
  const results: RepoStatsSourceResult[] = [];

  async function run<T>(
    source: RepoStatsSource,
    pathname: string,
    schema: z.ZodType<T>,
    store: (data: T) => Promise<number>,
  ): Promise<void> {
    try {
      const fetched = await requestStats(pathname, schema);
      if (fetched.kind !== 'json') {
        results.push({
          source,
          outcome: fetched.kind === 'pending' ? 'PENDING' : fetched.kind === 'empty' ? 'EMPTY' : 'UNSUPPORTED',
          httpStatus: fetched.httpStatus,
          itemCount: 0,
        });
        return;
      }
      const itemCount = await store(fetched.data);
      results.push({ source, outcome: 'OK', httpStatus: 200, itemCount });
    } catch (error) {
      const failure = failureOutcome(error);
      results.push({ source, outcome: failure.outcome, httpStatus: failure.httpStatus, itemCount: 0 });
    }
  }

  await run('metadata', '', metadataSchema, (data) => storeMetadata(capturedFor, data));
  await run('commit_activity', 'stats/commit_activity', commitActivitySchema, storeCommitActivity);
  await run('contributors', 'stats/contributors?per_page=100&anon=0', contributorsSchema, (data) =>
    replaceContributors(capturedFor, data),
  );
  await run('code_frequency', 'stats/code_frequency', codeFrequencySchema, storeCodeFrequency);
  await run('participation', 'stats/participation', participationSchema, (data) =>
    storeParticipation(nowInstant, data),
  );
  await run('punch_card', 'stats/punch_card', punchCardSchema, storePunchCard);

  const success = results.every(
    (result) =>
      result.outcome === 'OK' ||
      result.outcome === 'PENDING' ||
      result.outcome === 'EMPTY' ||
      result.outcome === 'UNSUPPORTED',
  );

  return { success, results };
}
