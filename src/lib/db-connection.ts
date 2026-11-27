/**
 * Database connection-string resolution shared by the runtime client
 * (`src/lib/db.ts`) and the Prisma CLI configuration (`prisma.config.ts`).
 *
 * Two operating modes are supported, selected by `DATABASE_PROVIDER`:
 *
 * | `DATABASE_PROVIDER` | Runtime variable                       | Allowed hosts                                             |
 * | ------------------- | -------------------------------------- | --------------------------------------------------------- |
 * | `prisma` (default)  | `DATABASE_URL_POOLED`                  | `pooled.db.prisma.io`, plus loopback outside production    |
 * | `self-hosted`       | `DATABASE_URL_POOLED`, then `DATABASE_URL` | loopback, single-label service names, `DATABASE_ALLOWED_HOSTS` |
 *
 * Prisma mode keeps the original contract unchanged:
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
 * Self-hosted mode exists because a container behind `postgres` or a private
 * host can never satisfy the Prisma host rule. It relaxes *which* hosts are
 * accepted, not *whether* hosts are checked:
 *
 * - loopback (`localhost`, `127.0.0.1`, `::1`) is always accepted,
 * - single-label names such as `postgres` (Docker Compose service names,
 *   intranet short names) are accepted — they can not be a public FQDN,
 * - every other host (FQDN, private/public IP, IPv6) must be listed explicitly
 *   in `DATABASE_ALLOWED_HOSTS` (comma-separated), so there is no blanket
 *   allow-any-host switch,
 * - the scheme must be `postgresql:`/`postgres:`, the URL must name a database,
 *   a user name is always required and a password is required in a production
 *   runtime.
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

/** Selects the host-validation rules. */
export const DATABASE_PROVIDERS = ['prisma', 'self-hosted'] as const;

export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

/**
 * Default when `DATABASE_PROVIDER` is unset. Deliberately the historical, most
 * restrictive mode: existing Vercel deployments keep working without a new
 * variable, and nothing becomes reachable merely because a variable is absent.
 */
export const DEFAULT_DATABASE_PROVIDER: DatabaseProvider = 'prisma';

export const DATABASE_PROVIDER_VARIABLE = 'DATABASE_PROVIDER';

/** Comma-separated host allowlist for {@link DatabaseProvider} `self-hosted`. */
export const DATABASE_ALLOWED_HOSTS_VARIABLE = 'DATABASE_ALLOWED_HOSTS';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * A single DNS label: letters, digits and inner hyphens, no dot and no colon.
 * `postgres`, `db`, `webradio-db` match; `db.example.com`, `10.0.0.5` and
 * `fe80::1` do not.
 */
const SINGLE_LABEL_HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Any `process.env`-like record. Kept narrow so tests can pass plain objects. */
export type DatabaseEnv = Record<string, string | undefined>;

export type RuntimeConnectionSource =
  | 'DATABASE_URL_POOLED'
  | 'DATABASE_URL_POOLED (self-hosted)'
  | 'DATABASE_URL (self-hosted)'
  | 'DATABASE_URL (local development fallback)'
  | 'placeholder (build/test)';

export type CliConnectionSource =
  | 'DIRECT_URL'
  | 'DIRECT_URL (self-hosted)'
  | 'DATABASE_URL (self-hosted)'
  | 'DATABASE_URL (local development fallback)';

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
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
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

/**
 * Resolves `DATABASE_PROVIDER`.
 *
 * An unset variable means {@link DEFAULT_DATABASE_PROVIDER}. An unknown value is
 * a hard error rather than a silent fallback: a typo must never downgrade or
 * upgrade the host rules. The configured value is not echoed, because a
 * mistyped connection string could otherwise end up in a log.
 */
export function resolveDatabaseProvider(env: DatabaseEnv = process.env): DatabaseProvider {
  const raw = readEnvValue(env, DATABASE_PROVIDER_VARIABLE);
  if (raw === undefined) {
    return DEFAULT_DATABASE_PROVIDER;
  }

  const normalized = raw.toLowerCase();
  if ((DATABASE_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as DatabaseProvider;
  }

  throw new DatabaseConfigError(
    `${DATABASE_PROVIDER_VARIABLE} has an unknown value.\n` +
      `Expected "prisma" (Prisma Postgres, the default) or "self-hosted" (own PostgreSQL).\n` +
      'The configured value is never printed; check it for typos.',
  );
}

/** Parses `DATABASE_ALLOWED_HOSTS` into normalized hostnames. */
export function parseAllowedDatabaseHosts(env: DatabaseEnv = process.env): string[] {
  const raw = readEnvValue(env, DATABASE_ALLOWED_HOSTS_VARIABLE);
  if (raw === undefined) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^\[|\]$/g, ''))
    .filter((entry) => entry !== '');
}

/**
 * Self-hosted host rule: loopback and single-label service names by default,
 * everything else only when listed in `DATABASE_ALLOWED_HOSTS`.
 */
export function isSelfHostedHostnameAllowed(hostname: string, allowedHosts: string[]): boolean {
  if (isLoopbackHostname(hostname)) {
    return true;
  }

  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (allowedHosts.includes(normalized)) {
    return true;
  }

  return SINGLE_LABEL_HOSTNAME.test(normalized);
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
 * Validates a self-hosted connection URL. Every branch returns a message that
 * names the variable (and hostname) only — never user, password or the URL.
 */
function describeSelfHostedUrlProblem(
  variable: string,
  raw: string,
  env: DatabaseEnv,
  production: boolean,
): DatabaseConfigError | null {
  const invalid = describeUrlProblem(variable, raw);
  if (invalid) {
    return invalid;
  }

  const parsed = new URL(raw);
  const hostname = parsed.hostname;
  const allowedHosts = parseAllowedDatabaseHosts(env);

  if (!isSelfHostedHostnameAllowed(hostname, allowedHosts)) {
    return new DatabaseConfigError(
      `${variable} points to a host that is not allowed in the self-hosted database mode: ${hostname}\n` +
        'Allowed without further configuration: loopback hosts and single-label container/service names (e.g. "postgres").\n' +
        `Any other host (FQDN, private or public IP, IPv6) must be listed in ${DATABASE_ALLOWED_HOSTS_VARIABLE} (comma-separated).\n` +
        `Use ${DATABASE_PROVIDER_VARIABLE}=prisma for Prisma Postgres.`,
    );
  }

  const database = parsed.pathname.replace(/^\/+/, '');
  if (database === '') {
    return new DatabaseConfigError(
      `${variable} does not name a database.\n` +
        'Expected "postgresql://USER:PASSWORD@HOST:PORT/DATABASE"; the value is never printed.',
    );
  }

  if (parsed.username === '') {
    return new DatabaseConfigError(
      `${variable} has no user name.\n` +
        'Self-hosted mode requires an explicit database user; the value is never printed.',
    );
  }

  if (production && parsed.password === '') {
    return new DatabaseConfigError(
      `${variable} has no password.\n` +
        'A production runtime requires password authentication; the value is never printed.\n' +
        'Local development may rely on a password-less local PostgreSQL.',
    );
  }

  return null;
}

/**
 * Resolves the URL for the application runtime.
 *
 * Prisma mode order:
 * 1. `DATABASE_URL_POOLED` (required in production, must be the pooled host).
 * 2. `DATABASE_URL` only as a local-development fallback for loopback hosts.
 * 3. A loopback placeholder during the build phase / in tests, so prerendering
 *    never needs a real database (the Prisma 8 client connects lazily).
 *
 * Self-hosted mode order: `DATABASE_URL_POOLED`, then `DATABASE_URL`, both
 * checked against the self-hosted host rule.
 */
export function resolveRuntimeDatabaseUrl(
  env: DatabaseEnv = process.env,
): ResolvedConnection<RuntimeConnectionSource> {
  return resolveDatabaseProvider(env) === 'self-hosted'
    ? resolveSelfHostedRuntimeUrl(env)
    : resolvePrismaRuntimeUrl(env);
}

function resolvePrismaRuntimeUrl(
  env: DatabaseEnv,
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
          `For an own PostgreSQL set ${DATABASE_PROVIDER_VARIABLE}=self-hosted.\n` +
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

function resolveSelfHostedRuntimeUrl(
  env: DatabaseEnv,
): ResolvedConnection<RuntimeConnectionSource> {
  const production = isProductionRuntime(env);

  for (const variable of ['DATABASE_URL_POOLED', 'DATABASE_URL'] as const) {
    const raw = readEnvValue(env, variable);
    if (raw === undefined) {
      continue;
    }

    const problem = describeSelfHostedUrlProblem(variable, raw, env, production);
    if (problem) {
      throw problem;
    }

    return {
      url: raw,
      hostname: parsePostgresHostname(raw)!,
      source:
        variable === 'DATABASE_URL_POOLED'
          ? 'DATABASE_URL_POOLED (self-hosted)'
          : 'DATABASE_URL (self-hosted)',
    };
  }

  if (production) {
    throw new DatabaseConfigError(
      `DATABASE_URL must be set at runtime with ${DATABASE_PROVIDER_VARIABLE}=self-hosted.\n` +
        'DATABASE_URL_POOLED is accepted as well; there is no fallback to DIRECT_URL.\n' +
        'See docs/HOSTING_PORTABILITY.md.',
    );
  }

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
 * Prisma mode: `DIRECT_URL` is required; a loopback `DATABASE_URL` is accepted
 * only outside production as a documented local fallback, so a local test
 * database keeps working without a second variable.
 *
 * Self-hosted mode: `DIRECT_URL`, then `DATABASE_URL`, both validated against
 * the self-hosted host rule (there is no pooled/direct split to enforce).
 */
export function resolveCliDatabaseUrl(
  env: DatabaseEnv = process.env,
): ResolvedConnection<CliConnectionSource> {
  return resolveDatabaseProvider(env) === 'self-hosted'
    ? resolveSelfHostedCliUrl(env)
    : resolvePrismaCliUrl(env);
}

function resolvePrismaCliUrl(env: DatabaseEnv): ResolvedConnection<CliConnectionSource> {
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
          `For an own PostgreSQL set ${DATABASE_PROVIDER_VARIABLE}=self-hosted.\n` +
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

function resolveSelfHostedCliUrl(env: DatabaseEnv): ResolvedConnection<CliConnectionSource> {
  const production = isProductionRuntime(env);

  for (const variable of ['DIRECT_URL', 'DATABASE_URL'] as const) {
    const raw = readEnvValue(env, variable);
    if (raw === undefined) {
      continue;
    }

    const problem = describeSelfHostedUrlProblem(variable, raw, env, production);
    if (problem) {
      throw problem;
    }

    return {
      url: raw,
      hostname: parsePostgresHostname(raw)!,
      source: variable === 'DIRECT_URL' ? 'DIRECT_URL (self-hosted)' : 'DATABASE_URL (self-hosted)',
    };
  }

  throw new DatabaseConfigError(
    `DIRECT_URL or DATABASE_URL must be set for Prisma CLI operations with ${DATABASE_PROVIDER_VARIABLE}=self-hosted.\n` +
      'See docs/HOSTING_PORTABILITY.md.',
  );
}

/** Result of the non-throwing CLI resolution used by `prisma.config.ts`. */
export type CliDatabaseProbe =
  | { readonly status: 'resolved'; readonly connection: ResolvedConnection<CliConnectionSource> }
  /** Nothing usable configured: the normal state for builds and `contract emit`. */
  | { readonly status: 'unconfigured' }
  /** A connection is configured but unusable (or the provider is invalid); secret-free. */
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
 * - `invalid`      something is set but wrong (including an unknown
 *                  `DATABASE_PROVIDER`); callers log the reason and omit the
 *                  connection, and DB commands still refuse to run.
 */
export function probeCliDatabaseUrl(env: DatabaseEnv = process.env): CliDatabaseProbe {
  let provider: DatabaseProvider;
  try {
    provider = resolveDatabaseProvider(env);
  } catch (error) {
    // A misconfigured provider must stay visible even for an offline build.
    return {
      status: 'invalid',
      reason:
        error instanceof DatabaseConfigError
          ? error.message
          : `${DATABASE_PROVIDER_VARIABLE} could not be resolved.`,
    };
  }

  const configured =
    readEnvValue(env, 'DIRECT_URL') !== undefined ||
    (provider === 'self-hosted' && readEnvValue(env, 'DATABASE_URL') !== undefined);

  try {
    return { status: 'resolved', connection: resolveCliDatabaseUrl(env) };
  } catch (error) {
    // Silent only when the operator configured nothing for the CLI: a legacy
    // remote DATABASE_URL must not turn a build into a warning storm.
    if (!configured) {
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
