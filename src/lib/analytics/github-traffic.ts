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

export type TrafficSource = 'views' | 'clones' | 'referrers' | 'paths';

export type TrafficErrorCode =
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NOT_CONFIGURED';

export class GitHubTrafficError extends Error {
  readonly code: TrafficErrorCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: TrafficErrorCode,
    message: string,
    options: { status?: number | null; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = 'GitHubTrafficError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

const nonNegativeInt = z.number().int().nonnegative();

const dailyPointSchema = z.object({
  timestamp: z.string().min(1),
  count: nonNegativeInt,
  uniques: nonNegativeInt,
});

const viewsResponseSchema = z.object({
  count: nonNegativeInt,
  uniques: nonNegativeInt,
  views: z.array(dailyPointSchema),
});

const clonesResponseSchema = z.object({
  count: nonNegativeInt,
  uniques: nonNegativeInt,
  clones: z.array(dailyPointSchema),
});

const referrersResponseSchema = z.array(
  z.object({
    referrer: z.string().min(1),
    count: nonNegativeInt,
    uniques: nonNegativeInt,
  }),
);

const pathsResponseSchema = z.array(
  z.object({
    path: z.string().min(1),
    title: z.string().optional(),
    count: nonNegativeInt,
    uniques: nonNegativeInt,
  }),
);

export type TrafficSyncResult = {
  success: boolean;
  daysStored: number;
  referrersStored: number;
  pathsStored: number;
  errors: {
    source: TrafficSource;
    code: TrafficErrorCode;
    status: number | null;
  }[];
};

/**
 * GitHub returns timestamps aligned to UTC midnight. Normalize defensively so a
 * timestamp with a time component can never create a second row for the day.
 */
export function utcDayStart(timestamp: string): Temporal.Instant {
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(timestamp);
  } catch {
    throw new GitHubTrafficError('INVALID_RESPONSE', 'Ungültiger Zeitstempel in der Traffic-Antwort.');
  }
  return instant.toZonedDateTimeISO('UTC').startOfDay().toInstant();
}

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function isRateLimited(response: Response): boolean {
  return response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
}

async function requestTrafficJson(pathname: string): Promise<unknown> {
  const auth = await getInstallationAccessToken();
  if (!auth.token) {
    throw new GitHubTrafficError(
      'NOT_CONFIGURED',
      'Keine GitHub-App-Installation konfiguriert; Traffic kann nicht gelesen werden.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}/repos/${GITHUB_REPOSITORY}/${pathname}`, {
      headers: { ...githubApiHeaders(), Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new GitHubTrafficError('UNAVAILABLE', 'GitHub Traffic API ist nicht erreichbar.');
  }

  if (!response.ok) {
    if (isRateLimited(response)) {
      throw new GitHubTrafficError('RATE_LIMITED', 'GitHub Rate-Limit für Traffic erreicht.', {
        status: response.status,
        retryAfterSeconds: retryAfterSeconds(response),
      });
    }
    if (response.status === 403) {
      throw new GitHubTrafficError(
        'PERMISSION_DENIED',
        'Der GitHub App fehlt die Berechtigung Administration:read für Traffic-Daten.',
        { status: 403 },
      );
    }
    if (response.status === 404) {
      throw new GitHubTrafficError('NOT_FOUND', 'Repository für Traffic nicht gefunden.', {
        status: 404,
      });
    }
    throw new GitHubTrafficError('UNAVAILABLE', `GitHub Traffic API antwortete mit ${response.status}.`, {
      status: response.status,
    });
  }

  try {
    return await response.json();
  } catch {
    throw new GitHubTrafficError('INVALID_RESPONSE', 'GitHub Traffic API lieferte kein gültiges JSON.');
  }
}

async function fetchTraffic<T>(pathname: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await requestTrafficJson(pathname);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new GitHubTrafficError('INVALID_RESPONSE', 'Ungültiges Antwortformat der GitHub Traffic API.');
  }
  return parsed.data;
}

type DayAggregate = {
  day: Temporal.Instant;
  views?: number;
  uniqueVisitors?: number;
  clones?: number;
  uniqueClones?: number;
};

function aggregateDays(
  targets: Map<string, DayAggregate>,
  points: { timestamp: string; count: number; uniques: number }[],
  kind: 'views' | 'clones',
): void {
  for (const point of points) {
    const day = utcDayStart(point.timestamp);
    const key = day.toString();
    const aggregate = targets.get(key) ?? { day };
    if (kind === 'views') {
      aggregate.views = point.count;
      aggregate.uniqueVisitors = point.uniques;
    } else {
      aggregate.clones = point.count;
      aggregate.uniqueClones = point.uniques;
    }
    targets.set(key, aggregate);
  }
}

async function storeDays(aggregates: DayAggregate[]): Promise<void> {
  if (aggregates.length === 0) return;
  const db = await getDb();

  await db.transaction(async (tx) => {
    for (const aggregate of aggregates) {
      const existing = await tx.orm.public.GitHubTrafficDaily.first({ day: aggregate.day });

      if (!existing) {
        await tx.orm.public.GitHubTrafficDaily.create({
          day: aggregate.day,
          views: aggregate.views ?? 0,
          uniqueVisitors: aggregate.uniqueVisitors ?? 0,
          clones: aggregate.clones ?? 0,
          uniqueClones: aggregate.uniqueClones ?? 0,
        });
        continue;
      }

      // Only overwrite the metrics that were actually fetched. A partial run
      // (views succeed, clones fail) must never reset the other column to 0.
      if (aggregate.views !== undefined) {
        await tx.orm.public.GitHubTrafficDaily.where({ id: existing.id }).update({
          views: aggregate.views,
          uniqueVisitors: aggregate.uniqueVisitors ?? 0,
        });
      }
      if (aggregate.clones !== undefined) {
        await tx.orm.public.GitHubTrafficDaily.where({ id: existing.id }).update({
          clones: aggregate.clones,
          uniqueClones: aggregate.uniqueClones ?? 0,
        });
      }
    }
  });
}

async function replaceReferrers(
  capturedFor: Temporal.Instant,
  rows: { referrer: string; count: number; uniques: number }[],
): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.orm.public.GitHubTrafficReferrerSnapshot.where({ capturedFor }).deleteAll();
    for (const row of rows) {
      await tx.orm.public.GitHubTrafficReferrerSnapshot.create({
        capturedFor,
        referrer: row.referrer.slice(0, 500),
        count: row.count,
        uniques: row.uniques,
      });
    }
  });
  return rows.length;
}

async function replacePaths(
  capturedFor: Temporal.Instant,
  rows: { path: string; title?: string; count: number; uniques: number }[],
): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.orm.public.GitHubTrafficPathSnapshot.where({ capturedFor }).deleteAll();
    for (const row of rows) {
      await tx.orm.public.GitHubTrafficPathSnapshot.create({
        capturedFor,
        path: row.path.slice(0, 500),
        title: row.title?.slice(0, 500) ?? null,
        count: row.count,
        uniques: row.uniques,
      });
    }
  });
  return rows.length;
}

function emptyResult(): TrafficSyncResult {
  return { success: true, daysStored: 0, referrersStored: 0, pathsStored: 0, errors: [] };
}

/**
 * Reads the four GitHub traffic endpoints and archives their values.
 *
 * - views/clones provide 14 daily buckets -> one row per UTC day, updated in
 *   place when GitHub corrects a value; older days are never deleted.
 * - referrers/paths are top-10 snapshots for the whole window -> replaced for
 *   the current capture day only, so history stays intact.
 *
 * A failing source never prevents the other sources from being stored.
 */
export async function syncGitHubTraffic(now: Date = new Date()): Promise<TrafficSyncResult> {
  const result = emptyResult();
  const capturedFor = utcDayStart(now.toISOString());
  const days = new Map<string, DayAggregate>();

  try {
    const views = await fetchTraffic(
      'traffic/views?per=day',
      viewsResponseSchema,
    );
    aggregateDays(days, views.views, 'views');
  } catch (error) {
    result.errors.push(toSourceError('views', error));
  }

  try {
    const clones = await fetchTraffic(
      'traffic/clones?per=day',
      clonesResponseSchema,
    );
    aggregateDays(days, clones.clones, 'clones');
  } catch (error) {
    result.errors.push(toSourceError('clones', error));
  }

  try {
    await storeDays([...days.values()]);
    result.daysStored = days.size;
  } catch {
    result.errors.push({ source: 'views', code: 'UNAVAILABLE', status: null });
  }

  try {
    const referrers = await fetchTraffic('traffic/popular/referrers', referrersResponseSchema);
    result.referrersStored = await replaceReferrers(capturedFor, referrers);
  } catch (error) {
    result.errors.push(toSourceError('referrers', error));
  }

  try {
    const paths = await fetchTraffic('traffic/popular/paths', pathsResponseSchema);
    result.pathsStored = await replacePaths(capturedFor, paths);
  } catch (error) {
    result.errors.push(toSourceError('paths', error));
  }

  result.success = result.errors.length === 0;
  return result;
}

function toSourceError(
  source: TrafficSource,
  error: unknown,
): { source: TrafficSource; code: TrafficErrorCode; status: number | null } {
  if (error instanceof GitHubTrafficError) {
    return { source, code: error.code, status: error.status };
  }
  return { source, code: 'UNAVAILABLE', status: null };
}
