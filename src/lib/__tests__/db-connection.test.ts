/**
 * Unit tests for the database connection-string contract.
 *
 * No database connection is opened: `resolveRuntimeDatabaseUrl` and
 * `resolveCliDatabaseUrl` are pure functions over an env record.
 */
import {
  DIRECT_HOST,
  DatabaseConfigError,
  PLACEHOLDER_DATABASE_URL,
  POOLED_HOST,
  isBuildPhase,
  isProductionRuntime,
  parsePostgresHostname,
  resolveCliDatabaseUrl,
  resolveRuntimeDatabaseUrl,
  type DatabaseEnv,
} from '../db-connection';

const POOLED_URL = `postgresql://app:pool-secret@${POOLED_HOST}:5432/postgres?sslmode=require`;
const DIRECT_URL_VALUE = `postgresql://app:direct-secret@${DIRECT_HOST}:5432/postgres?sslmode=require`;
const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/webradio_dev';
const LOCAL_TEST_URL = 'postgresql://postgres:postgres@localhost:5432/webradio_test';

function expectConfigError(callback: () => unknown, pattern: RegExp): DatabaseConfigError {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseConfigError);
    const configError = error as DatabaseConfigError;
    expect(configError.message).toMatch(pattern);
    // Error messages must stay secret-safe.
    expect(configError.message).not.toMatch(/pool-secret|direct-secret|postgres:postgres/i);
    return configError;
  }
  throw new Error('Expected DatabaseConfigError, but nothing was thrown.');
}

describe('parsePostgresHostname', () => {
  it('parses postgresql and postgres schemes', () => {
    expect(parsePostgresHostname(POOLED_URL)).toBe(POOLED_HOST);
    expect(parsePostgresHostname('postgres://user:pass@db.prisma.io:5432/app')).toBe(DIRECT_HOST);
    expect(parsePostgresHostname('postgresql://postgres@localhost:5432/app')).toBe('localhost');
    expect(parsePostgresHostname('postgresql://postgres@[::1]:5432/app')).toBe('[::1]');
  });

  it('rejects non-PostgreSQL URLs and garbage', () => {
    expect(parsePostgresHostname('not-a-url')).toBeNull();
    expect(parsePostgresHostname('https://pooled.db.prisma.io/postgres')).toBeNull();
    expect(parsePostgresHostname('')).toBeNull();
  });
});

describe('environment phase helpers', () => {
  it('detects build phase and production runtime separately', () => {
    expect(isBuildPhase({ NEXT_PHASE: 'phase-production-build' })).toBe(true);
    expect(
      isProductionRuntime({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }),
    ).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'test' })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'development' })).toBe(false);
  });
});

describe('resolveRuntimeDatabaseUrl', () => {
  it('uses DATABASE_URL_POOLED in production', () => {
    const resolved = resolveRuntimeDatabaseUrl({
      NODE_ENV: 'production',
      DATABASE_URL_POOLED: POOLED_URL,
      // A direct URL must not win over the pooled one.
      DIRECT_URL: DIRECT_URL_VALUE,
    });

    expect(resolved).toEqual({
      url: POOLED_URL,
      hostname: POOLED_HOST,
      source: 'DATABASE_URL_POOLED',
    });
  });

  it('never falls back to DATABASE_URL in production', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          // Even a pooled-looking legacy value must not stand in.
          DATABASE_URL: POOLED_URL,
        }),
      /DATABASE_URL_POOLED is required at runtime in production/,
    );
  });

  it('never falls back to DIRECT_URL in production', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          DIRECT_URL: DIRECT_URL_VALUE,
        }),
      /DATABASE_URL_POOLED is required at runtime in production/,
    );
  });

  it('rejects a direct host in DATABASE_URL_POOLED', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL_POOLED: DIRECT_URL_VALUE,
        }),
      /db\.prisma\.io \(direct connection\)/,
    );
  });

  it('rejects a loopback DATABASE_URL_POOLED in production', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL_POOLED: LOCAL_URL,
        }),
      /loopback host, which is only allowed in local development/,
    );
  });

  it('rejects an unexpected host in DATABASE_URL_POOLED', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL_POOLED: 'postgresql://user:pass@db.example.com:5432/app',
        }),
      /unexpected hostname: db\.example\.com/,
    );
  });

  it('rejects invalid connection strings without echoing them', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL_POOLED: 'postgresql://app:pool-secret@pooled.db.prisma.io:not-a-port/db',
        }),
      /DATABASE_URL_POOLED is not a valid PostgreSQL connection URL/,
    );

    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL_POOLED: 'https://pooled.db.prisma.io',
        }),
      /DATABASE_URL_POOLED is not a valid PostgreSQL connection URL/,
    );
  });

  it('accepts a loopback DATABASE_URL outside production', () => {
    const resolved = resolveRuntimeDatabaseUrl({
      NODE_ENV: 'development',
      DATABASE_URL: LOCAL_URL,
    });

    expect(resolved.url).toBe(LOCAL_URL);
    expect(resolved.source).toBe('DATABASE_URL (local development fallback)');
  });

  it('accepts the integration-test database URL', () => {
    // `scripts/run-integration-tests.mjs` sets NODE_ENV=test and DATABASE_URL.
    const resolved = resolveRuntimeDatabaseUrl({
      NODE_ENV: 'test',
      DATABASE_URL: LOCAL_TEST_URL,
    });

    expect(resolved.url).toBe(LOCAL_TEST_URL);
    expect(resolved.source).toBe('DATABASE_URL (local development fallback)');
  });

  it('rejects a remote DATABASE_URL outside production', () => {
    expectConfigError(
      () =>
        resolveRuntimeDatabaseUrl({
          NODE_ENV: 'development',
          DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/webradio_dev',
        }),
      /limited to loopback hosts/,
    );
  });

  it('uses a loopback placeholder without configuration', () => {
    for (const env of [
      { NODE_ENV: 'test' } satisfies DatabaseEnv,
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' },
    ]) {
      const resolved = resolveRuntimeDatabaseUrl(env as DatabaseEnv);
      expect(resolved.url).toBe(PLACEHOLDER_DATABASE_URL);
      expect(resolved.hostname).toBe('localhost');
      expect(resolved.source).toBe('placeholder (build/test)');
    }
  });

  it('does not require credentials during the production build', () => {
    expect(() =>
      resolveRuntimeDatabaseUrl({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }),
    ).not.toThrow();
  });
});

describe('resolveCliDatabaseUrl', () => {
  it('uses DIRECT_URL for CLI operations', () => {
    const resolved = resolveCliDatabaseUrl({
      NODE_ENV: 'production',
      DIRECT_URL: DIRECT_URL_VALUE,
      DATABASE_URL_POOLED: POOLED_URL,
    });

    expect(resolved).toEqual({
      url: DIRECT_URL_VALUE,
      hostname: DIRECT_HOST,
      source: 'DIRECT_URL',
    });
  });

  it('requires DIRECT_URL in production instead of falling back', () => {
    expectConfigError(
      () =>
        resolveCliDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL_POOLED: POOLED_URL,
        }),
      /DIRECT_URL must be set for Prisma CLI operations/,
    );

    expectConfigError(
      () =>
        resolveCliDatabaseUrl({
          NODE_ENV: 'production',
          DATABASE_URL: DIRECT_URL_VALUE,
        }),
      /DIRECT_URL must be set for Prisma CLI operations/,
    );
  });

  it('rejects a pooled host in DIRECT_URL', () => {
    expectConfigError(
      () =>
        resolveCliDatabaseUrl({
          NODE_ENV: 'production',
          DIRECT_URL: POOLED_URL,
        }),
      /Migrations and schema commands must use the direct db\.prisma\.io connection/,
    );
  });

  it('rejects a loopback DIRECT_URL in production', () => {
    expectConfigError(
      () =>
        resolveCliDatabaseUrl({
          NODE_ENV: 'production',
          DIRECT_URL: LOCAL_URL,
        }),
      /loopback host, which is only allowed in local development/,
    );
  });

  it('accepts a loopback DIRECT_URL for local migrations', () => {
    const resolved = resolveCliDatabaseUrl({
      NODE_ENV: 'development',
      DIRECT_URL: LOCAL_URL,
    });

    expect(resolved.url).toBe(LOCAL_URL);
    expect(resolved.source).toBe('DIRECT_URL');
  });

  it('falls back to a loopback DATABASE_URL outside production', () => {
    // Local development and CI keep working with a single local variable.
    const resolved = resolveCliDatabaseUrl({
      NODE_ENV: 'development',
      DATABASE_URL: LOCAL_URL,
    });

    expect(resolved.url).toBe(LOCAL_URL);
    expect(resolved.source).toBe('DATABASE_URL (local development fallback)');
  });

  it('rejects a remote DATABASE_URL as CLI fallback', () => {
    expectConfigError(
      () =>
        resolveCliDatabaseUrl({
          NODE_ENV: 'development',
          DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app',
        }),
      /limited to loopback hosts/,
    );
  });

  it('rejects a direct URL with an unexpected host', () => {
    expectConfigError(
      () =>
        resolveCliDatabaseUrl({
          NODE_ENV: 'production',
          DIRECT_URL: 'postgresql://user:pass@db.example.com:5432/app',
        }),
      /unexpected hostname: db\.example\.com/,
    );
  });

  it('throws when nothing is configured', () => {
    expectConfigError(() => resolveCliDatabaseUrl({ NODE_ENV: 'test' }), /DIRECT_URL must be set/);
  });
});
