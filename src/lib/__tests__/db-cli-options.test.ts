/**
 * Unit tests for the `lock_timeout` defaults the Prisma CLI wrapper applies
 * (see `src/lib/db-cli-options.ts` and `scripts/prisma-db.mts`).
 *
 * Motivation: the dry run of `20261030T2041_plugin_repository_url` showed that
 * with PostgreSQL's default `lock_timeout = 0` a migration waits behind a
 * reader until that reader finishes (9.1s of waiting for a 10s lock). The
 * wrapper must therefore make schema-changing commands fail fast — without
 * touching read-only commands or persisting any database setting.
 */
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  LOCK_TIMEOUT_ENV,
  buildDbCommandEnv,
  describeLockTimeout,
  isLockSensitiveCommand,
  resolveLockTimeoutMs,
} from '../db-cli-options';

describe('isLockSensitiveCommand', () => {
  it.each([
    [['db', 'migrate']],
    [['db', 'update']],
    [['db', 'init']],
    [['migrate', 'deploy']],
    [['migrate', 'dev']],
    [['migration', 'apply']],
    [['migration', 'deploy']],
    [['migration', 'resolve']],
  ])('treats %j as lock sensitive', (args) => {
    expect(isLockSensitiveCommand(args)).toBe(true);
  });

  it.each([
    [['db', 'verify']],
    [['db', 'verify', '--strict']],
    [['db', 'status']],
    [['db', 'schema']],
    [['migration', 'status']],
    [['studio']],
    [['db']],
    [[]],
  ])('leaves %j alone', (args) => {
    expect(isLockSensitiveCommand(args)).toBe(false);
  });

  it('ignores flags in front of the command', () => {
    expect(isLockSensitiveCommand(['--schema', 'prisma', 'db', 'migrate'])).toBe(true);
    expect(isLockSensitiveCommand(['--verbose', 'db', 'verify'])).toBe(false);
  });
});

describe('resolveLockTimeoutMs', () => {
  it('defaults to the safe ceiling', () => {
    expect(resolveLockTimeoutMs({})).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(DEFAULT_LOCK_TIMEOUT_MS).toBe(3_000);
  });

  it('honours an operator override', () => {
    expect(resolveLockTimeoutMs({ [LOCK_TIMEOUT_ENV]: '15000' })).toBe(15_000);
    expect(resolveLockTimeoutMs({ [LOCK_TIMEOUT_ENV]: ' 500 ' })).toBe(500);
  });

  it('returns null when explicitly disabled', () => {
    expect(resolveLockTimeoutMs({ [LOCK_TIMEOUT_ENV]: '0' })).toBeNull();
  });

  it('falls back to the default for unusable values', () => {
    expect(resolveLockTimeoutMs({ [LOCK_TIMEOUT_ENV]: 'abc' })).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(resolveLockTimeoutMs({ [LOCK_TIMEOUT_ENV]: '-5' })).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(resolveLockTimeoutMs({ [LOCK_TIMEOUT_ENV]: '   ' })).toBe(DEFAULT_LOCK_TIMEOUT_MS);
  });
});

describe('buildDbCommandEnv', () => {
  it('adds lock_timeout for a migration', () => {
    const env = buildDbCommandEnv({ PATH: '/bin' }, ['db', 'migrate']);

    expect(env['PGOPTIONS']).toBe('-c lock_timeout=3000');
    expect(env['PATH']).toBe('/bin');
  });

  it('keeps unrelated PGOPTIONS and appends the timeout', () => {
    const env = buildDbCommandEnv({ PGOPTIONS: '-c statement_timeout=60000' }, ['db', 'migrate']);

    expect(env['PGOPTIONS']).toBe('-c statement_timeout=60000 -c lock_timeout=3000');
  });

  it('never overrides a lock_timeout supplied through PGOPTIONS', () => {
    const env = buildDbCommandEnv({ PGOPTIONS: '-c lock_timeout=250' }, ['db', 'migrate']);

    expect(env['PGOPTIONS']).toBe('-c lock_timeout=250');
  });

  it('does not add anything to read-only commands', () => {
    for (const args of [['db', 'verify'], ['db', 'status'], ['migration', 'status'], ['studio']]) {
      expect(buildDbCommandEnv({ PATH: '/bin' }, args)['PGOPTIONS']).toBeUndefined();
    }
  });

  it('respects the override and the explicit opt-out', () => {
    expect(
      buildDbCommandEnv({ [LOCK_TIMEOUT_ENV]: '12000' }, ['db', 'migrate'])['PGOPTIONS'],
    ).toBe('-c lock_timeout=12000');
    expect(
      buildDbCommandEnv({ [LOCK_TIMEOUT_ENV]: '0' }, ['db', 'migrate'])['PGOPTIONS'],
    ).toBeUndefined();
  });

  it('does not mutate the caller’s environment object', () => {
    const base = { PATH: '/bin', PGOPTIONS: '-c search_path=public' };

    buildDbCommandEnv(base, ['db', 'migrate']);

    expect(base).toEqual({ PATH: '/bin', PGOPTIONS: '-c search_path=public' });
  });
});

describe('describeLockTimeout', () => {
  it('reports the applied timeout for migrations', () => {
    expect(describeLockTimeout({}, ['db', 'migrate'])).toBe(
      'lock_timeout: 3000ms (PGOPTIONS, abort instead of waiting)',
    );
  });

  it('reports when an existing PGOPTIONS value is kept', () => {
    expect(describeLockTimeout({ PGOPTIONS: '-c lock_timeout=100' }, ['db', 'migrate'])).toBe(
      'lock_timeout: kept the value from PGOPTIONS',
    );
  });

  it('reports the opt-out and stays silent for read-only commands', () => {
    expect(describeLockTimeout({ [LOCK_TIMEOUT_ENV]: '0' }, ['db', 'migrate'])).toBe(
      'lock_timeout: disabled (command may wait indefinitely)',
    );
    expect(describeLockTimeout({}, ['db', 'verify'])).toBeNull();
  });
});
