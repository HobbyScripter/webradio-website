/**
 * Session settings for the Prisma CLI wrapper (`scripts/prisma-db.mts`).
 *
 * Why this exists:
 *
 *   A schema migration takes an `ACCESS EXCLUSIVE` lock on the tables it
 *   touches. With PostgreSQL's default `lock_timeout = 0` the migration waits
 *   *forever* behind a single long-running reader, blocking every new query on
 *   that table while it waits. The verified dry run of
 *   `20261030T2041_plugin_repository_url` showed exactly that: with a lock held
 *   for 10s the migration waited 9.1s instead of failing fast.
 *
 *   So the wrapper injects a `lock_timeout` for commands that can modify the
 *   schema. The value is passed as a PostgreSQL startup option (`PGOPTIONS`),
 *   which is applied per connection by the server — no `ALTER ROLE`, no `SET` on
 *   database level, nothing persistent. The same mechanism was proven to reach
 *   the migration connection during the dry run: a blocked run aborted with
 *   "Zeitüberschreitung einer Sperre" and left marker, ledger and schema
 *   untouched.
 *
 * Deliberately *not* applied to read-only commands (`db verify`, `db status`,
 * `db schema`, `migration status`) or to `studio`: those never need an
 * `ACCESS EXCLUSIVE` lock, and a timeout would only produce confusing failures
 * in an interactive tool.
 *
 * This module is dependency-free so it can be unit tested without a database.
 */

/** Default ceiling for waiting on a lock before a schema-changing command aborts. */
export const DEFAULT_LOCK_TIMEOUT_MS = 3_000;

/** Operator override, e.g. `PRISMA_DB_LOCK_TIMEOUT_MS=15000` or `0` to disable. */
export const LOCK_TIMEOUT_ENV = 'PRISMA_DB_LOCK_TIMEOUT_MS';

/**
 * Command paths that can modify the schema or the migration ledger and
 * therefore must not wait indefinitely for a lock. Matched as exact
 * `[command, subcommand]` pairs after dropping leading flags.
 */
const LOCK_SENSITIVE_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['db', 'migrate'],
  ['db', 'update'],
  ['db', 'init'],
  ['migration', 'apply'],
  ['migration', 'deploy'],
  ['migration', 'resolve'],
  ['migrate', 'deploy'],
  ['migrate', 'dev'],
];

/**
 * True when the command may need an `ACCESS EXCLUSIVE` lock.
 *
 * Flags and their values may precede the command (`--schema prisma db
 * migrate`), so the check looks for an adjacent command pair instead of
 * assuming fixed positions. A flag token itself never starts a pair.
 */
export function isLockSensitiveCommand(args: readonly string[]): boolean {
  for (let index = 0; index < args.length - 1; index += 1) {
    const command = args[index];
    const subcommand = args[index + 1];
    if (command === undefined || subcommand === undefined || command.startsWith('-')) {
      continue;
    }
    if (
      LOCK_SENSITIVE_COMMANDS.some(
        ([expectedCommand, expectedSub]) =>
          expectedCommand === command && expectedSub === subcommand,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves the `lock_timeout` in milliseconds.
 *
 * `null` means "no timeout" (explicitly disabled via `0` or an invalid value is
 * ignored in favour of the safe default).
 */
export function resolveLockTimeoutMs(env: { readonly [key: string]: string | undefined }): number | null {
  const raw = env[LOCK_TIMEOUT_ENV];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_LOCK_TIMEOUT_MS;
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_LOCK_TIMEOUT_MS;
  }
  // `0` is PostgreSQL's own "wait forever" value: an explicit opt-out.
  return parsed === 0 ? null : Math.trunc(parsed);
}

/** True when an existing `PGOPTIONS` value already sets `lock_timeout` itself. */
function hasLockTimeoutOption(pgOptions: string): boolean {
  return /(^|\s)-c\s*lock_timeout(=|\s)/.test(pgOptions);
}

/**
 * Returns the environment for the spawned Prisma CLI process.
 *
 * - Lock-sensitive commands get `-c lock_timeout=<ms>ms` added to `PGOPTIONS`.
 * - An operator-supplied `lock_timeout` inside `PGOPTIONS` always wins; the
 *   wrapper never appends a second, conflicting value.
 * - Other commands receive the environment unchanged.
 * - The input object is never mutated.
 *
 * The plain record type keeps this module independent of Next's global
 * `NodeJS.ProcessEnv` augmentation (which makes `NODE_ENV` mandatory).
 */
export function buildDbCommandEnv(
  baseEnv: { readonly [key: string]: string | undefined },
  args: readonly string[],
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...baseEnv };
  if (!isLockSensitiveCommand(args)) {
    return env;
  }

  const existing = (env['PGOPTIONS'] ?? '').trim();
  if (hasLockTimeoutOption(existing)) {
    return env;
  }

  const timeoutMs = resolveLockTimeoutMs(env);
  if (timeoutMs === null) {
    return env;
  }

  const option = `-c lock_timeout=${timeoutMs}`;
  env['PGOPTIONS'] = existing === '' ? option : `${existing} ${option}`;
  return env;
}

/** One secret-free log line describing what the wrapper did, or `null`. */
export function describeLockTimeout(
  baseEnv: { readonly [key: string]: string | undefined },
  args: readonly string[],
): string | null {
  if (!isLockSensitiveCommand(args)) {
    return null;
  }
  if (hasLockTimeoutOption((baseEnv['PGOPTIONS'] ?? '').trim())) {
    return 'lock_timeout: kept the value from PGOPTIONS';
  }
  const timeoutMs = resolveLockTimeoutMs(baseEnv);
  if (timeoutMs === null) {
    return 'lock_timeout: disabled (command may wait indefinitely)';
  }
  return `lock_timeout: ${timeoutMs}ms (PGOPTIONS, abort instead of waiting)`;
}
