/**
 * Database connection-string resolution shared by the runtime client
 * (`src/lib/db.ts`) and the Prisma CLI configuration (`prisma.config.ts`).
 *
 * The contract is deliberately explicit:
 *
 * | Consumer                      | Variable             | Host                 |
 * | ----------------------------- | -------------------- | -------------------- |
 * | Application / serverless      | `DATABASE_URL_POOLED`| `pooled.db.prisma.io`|
 * | Prisma CLI (migrations, ...)  | `DIRECT_URL`         | `db.prisma.io`       |
 *
 * There is **no** silent production fallback in either direction. In
 * production, a missing or mismatched variable aborts with a message that names
 * the variable and the expected host — never the connection string itself, so
 * credentials can not leak into logs.
 *
 * Local development and tests may use a loopback PostgreSQL (`localhost`,
 * `127.0.0.1`, `::1`) through `DATABASE_URL`, which the integration runner and
 * `next dev` already provide. That fallback is only accepted while the process
 * is not a production runtime, and only for loopback hosts.
 *
 * This module is intentionally dependency-free (no `next/*`, no Prisma imports)
 * so the Prisma CLI loader and the unit tests can both execute it.
 */

/** Host of the pooled Prisma Postgres endpoint used by application traffic. */
export const POOLED_HOST = 'pooled.db.prisma.io';

/** Host of the direct Prisma Postgres endpoint used by Prisma CLI operations. */
export const DIRECT_HOST = 'db.prisma.io';

/** Placeholder used while prerendering/building without database credentials. */
export const PLACEHOLDER_DATABASE_URL =
  'postgresql://placeholder:placeholder@localhost:5432/webradio_placeholder';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Any `process.env`-like record. Kept narrow so tests can pass plain objects. */
export type DatabaseEnv = Record<string, string | undefined>;

export type RuntimeConnectionSource =
  | 'DATABASE_URL_POOLED'
  | 'DATABASE_URL (local development fallback)'
  | 'placeholder (build/test)';

export type CliConnectionSource = 'DIRECT_URL' | 'DATABASE_URL (local development fallback)';

export interface ResolvedConnection<TSource extends string = string> {
  readonly url: string;
  /** Parsed hostname; useful for diagnostics and assertions in tests. */
  readonly hostname: string;
  readonly source: TSource;
}

/**
 * Configuration error with a message that is safe to log: it contains the
 * variable name and hostname only, never the full URL, user or password.
 */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

function readEnvValue(env: DatabaseEnv, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Returns the hostname of a PostgreSQL connection string, or `null` if invalid. */
export function parsePostgresHostname(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return null;
  }

  return parsed.hostname === '' ? null : parsed.hostname;
}

/** True for `localhost`, `127.0.0.1` and `::1` (with or without brackets). */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/** `next build` sets this before rendering; it is not a live server runtime. */
export function isBuildPhase(env: DatabaseEnv = process.env): boolean {
  return env['NEXT_PHASE'] === 'phase-production-build';
}

/**
 * Production *runtime* means a deployed server process, not the build step.
 * Both `next build` and the unit/integration test runners are excluded.
 */
export function isProductionRuntime(env: DatabaseEnv = process.env): boolean {
  return env['NODE_ENV'] === 'production' && !isBuildPhase(env);
}

function describeUrlProblem(variable: string, raw: string): DatabaseConfigError | null {
  const hostname = parsePostgresHostname(raw);
  if (hostname === null) {
    return new DatabaseConfigError(
      `${variable} is not a valid PostgreSQL connection URL.\n` +
        'Expected a "postgresql://USER:PASSWORD@HOST:PORT/DATABASE" string; the value is never printed.\n' +
        'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
    );
  }
  return null;
}

/**
 * Resolves the URL for the application runtime.
 *
 * Order:
 * 1. `DATABASE_URL_POOLED` (required in production, must be the pooled host).
 * 2. `DATABASE_URL` only as a local-development fallback for loopback hosts.
 * 3. A loopback placeholder during the build phase / in tests, so prerendering
 *    never needs a real database (the Prisma 8 client connects lazily).
 */
export function resolveRuntimeDatabaseUrl(
  env: DatabaseEnv = process.env,
): ResolvedConnection<RuntimeConnectionSource> {
  const production = isProductionRuntime(env);
  const pooled = readEnvValue(env, 'DATABASE_URL_POOLED');

  if (pooled !== undefined) {
    const problem = describeUrlProblem('DATABASE_URL_POOLED', pooled);
    if (problem) {
      throw problem;
    }

    const hostname = parsePostgresHostname(pooled)!;

    if (hostname === DIRECT_HOST) {
      throw new DatabaseConfigError(
        'DATABASE_URL_POOLED points to db.prisma.io (direct connection).\n' +
          'Application traffic must use pooled.db.prisma.io; DIRECT_URL is reserved for Prisma CLI operations.\n' +
          'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
      );
    }

    if (isLoopbackHostname(hostname)) {
      if (production) {
        throw new DatabaseConfigError(
          'DATABASE_URL_POOLED points to a loopback host, which is only allowed in local development.\n' +
            'Set DATABASE_URL_POOLED to the pooled.db.prisma.io connection string in production.\n' +
            'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
        );
      }
      return { url: pooled, hostname, source: 'DATABASE_URL_POOLED' };
    }

    if (hostname !== POOLED_HOST) {
      throw new DatabaseConfigError(
        `DATABASE_URL_POOLED has an unexpected hostname: ${hostname}\n` +
          'Expected: pooled.db.prisma.io (production) or a loopback host (local development).\n' +
          'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
      );
    }

    return { url: pooled, hostname, source: 'DATABASE_URL_POOLED' };
  }

  if (production) {
    // No fallback on purpose: neither DATABASE_URL nor DIRECT_URL may silently
    // stand in for the pooled runtime connection.
    throw new DatabaseConfigError(
      'DATABASE_URL_POOLED is required at runtime in production.\n' +
        'The application does not fall back to DATABASE_URL or DIRECT_URL automatically.\n' +
        'Set DATABASE_URL_POOLED to the pooled.db.prisma.io connection string; see docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
    );
  }

  const legacy = readEnvValue(env, 'DATABASE_URL');
  if (legacy !== undefined) {
    const problem = describeUrlProblem('DATABASE_URL', legacy);
    if (problem) {
      throw problem;
    }

    const hostname = parsePostgresHostname(legacy)!;

    if (isLoopbackHostname(hostname)) {
      return { url: legacy, hostname, source: 'DATABASE_URL (local development fallback)' };
    }

    throw new DatabaseConfigError(
      `DATABASE_URL is used as the local development fallback only, but it points to "${hostname}".\n` +
        'Outside production that fallback is limited to loopback hosts (localhost, 127.0.0.1, ::1).\n' +
        'Set DATABASE_URL_POOLED to the pooled.db.prisma.io connection string instead; see docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
    );
  }

  // Build phase, unit tests or a fresh checkout without .env: no connection is
  // opened because the Prisma 8 client only creates its pool on the first query.
  return {
    url: PLACEHOLDER_DATABASE_URL,
    hostname: 'localhost',
    source: 'placeholder (build/test)',
  };
}

/**
 * Resolves the URL for Prisma CLI operations (`prisma db migrate`, `db verify`,
 * `migration status`, `contract emit`).
 *
 * `DIRECT_URL` is required; a loopback `DATABASE_URL` is accepted only outside
 * production as a documented local fallback, so a local test database keeps
 * working without a second variable.
 */
export function resolveCliDatabaseUrl(env: DatabaseEnv = process.env): ResolvedConnection<CliConnectionSource> {
  const production = isProductionRuntime(env);
  const direct = readEnvValue(env, 'DIRECT_URL');

  if (direct !== undefined) {
    const problem = describeUrlProblem('DIRECT_URL', direct);
    if (problem) {
      throw problem;
    }

    const hostname = parsePostgresHostname(direct)!;

    if (hostname === POOLED_HOST) {
      throw new DatabaseConfigError(
        'DIRECT_URL points to pooled.db.prisma.io.\n' +
          'Migrations and schema commands must use the direct db.prisma.io connection; the pooled endpoint does not support them.\n' +
          'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
      );
    }

    if (isLoopbackHostname(hostname)) {
      if (production) {
        throw new DatabaseConfigError(
          'DIRECT_URL points to a loopback host, which is only allowed in local development.\n' +
            'Set DIRECT_URL to the db.prisma.io connection string for deployed environments.\n' +
            'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
        );
      }
      return { url: direct, hostname, source: 'DIRECT_URL' };
    }

    if (hostname !== DIRECT_HOST) {
      throw new DatabaseConfigError(
        `DIRECT_URL has an unexpected hostname: ${hostname}\n` +
          'Expected: db.prisma.io (production) or a loopback host (local development).\n' +
          'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
      );
    }

    return { url: direct, hostname, source: 'DIRECT_URL' };
  }

  if (production) {
    throw new DatabaseConfigError(
      'DIRECT_URL must be set for Prisma CLI operations.\n' +
        'The CLI does not fall back to DATABASE_URL_POOLED or DATABASE_URL automatically.\n' +
        'Set DIRECT_URL to the db.prisma.io connection string; see docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
    );
  }

  const legacy = readEnvValue(env, 'DATABASE_URL');
  if (legacy !== undefined) {
    const problem = describeUrlProblem('DATABASE_URL', legacy);
    if (problem) {
      throw problem;
    }

    const hostname = parsePostgresHostname(legacy)!;

    if (isLoopbackHostname(hostname)) {
      return { url: legacy, hostname, source: 'DATABASE_URL (local development fallback)' };
    }

    throw new DatabaseConfigError(
      `DATABASE_URL is used as the local CLI fallback only, but it points to "${hostname}".\n` +
        'Outside production that fallback is limited to loopback hosts; set DIRECT_URL to the db.prisma.io connection string instead.\n' +
        'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
    );
  }

  throw new DatabaseConfigError(
    'DIRECT_URL must be set for Prisma CLI operations.\n' +
      'For local development, DATABASE_URL may point to a loopback PostgreSQL instead.\n' +
      'See docs/VERCEL_DATABASE_INITIALIZATION_REPORT.md.',
  );
}

/** Result of the non-throwing CLI resolution used by `prisma.config.ts`. */
export type CliDatabaseProbe =
  | { readonly status: 'resolved'; readonly connection: ResolvedConnection<CliConnectionSource> }
  /** Nothing usable configured: the normal state for builds and `contract emit`. */
  | { readonly status: 'unconfigured' }
  /** `DIRECT_URL` is set but unusable; the reason is secret-free. */
  | { readonly status: 'invalid'; readonly reason: string };

/**
 * Non-throwing variant of {@link resolveCliDatabaseUrl} for `prisma.config.ts`.
 *
 * The Prisma CLI evaluates the config file for *every* command — including
 * `prisma contract emit`, which runs in `prebuild` and is offline by design.
 * The 8.0.0-rc config loader validates (`db.connection` eagerly, so a getter is
 * not an option), therefore the config may only hand over a connection it can
 * actually resolve. This probe never throws:
 *
 * - `resolved`     a valid direct (or documented local-loopback) URL exists,
 * - `unconfigured` nothing to use (build without credentials, `contract emit`),
 * - `invalid`      `DIRECT_URL` is set but wrong; callers log the reason and
 *                  omit the connection, and DB commands still refuse to run.
 */
export function probeCliDatabaseUrl(env: DatabaseEnv = process.env): CliDatabaseProbe {
  const directConfigured = readEnvValue(env, 'DIRECT_URL') !== undefined;

  try {
    return { status: 'resolved', connection: resolveCliDatabaseUrl(env) };
  } catch (error) {
    // Silent only when the operator configured nothing for the CLI: a legacy
    // remote DATABASE_URL must not turn a build into a warning storm.
    if (!directConfigured) {
      return { status: 'unconfigured' };
    }

    return {
      status: 'invalid',
      reason:
        error instanceof DatabaseConfigError
          ? error.message
          : 'DIRECT_URL could not be resolved.',
    };
  }
}
