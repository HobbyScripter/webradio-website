/**
 * Contract tests for the Prisma CLI configuration (`prisma.config.ts`).
 *
 * Regression: the config used to call the throwing resolver at module scope, so
 * every CLI command — including the offline `prisma contract emit` that runs in
 * `prebuild` — required `DIRECT_URL`. A Vercel build without that variable died
 * with `CLI.CONFIG_UNREADABLE`.
 *
 * The config is loaded in a child process on purpose: the Prisma loader
 * evaluates it as ESM with type stripping, and `dotenv/config` reads the CWD, so
 * a temp CWD makes the test hermetic with respect to the developer's `.env`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const configUrl = pathToFileURL(join(projectRoot, 'prisma.config.ts')).href;

interface LoadedConfig {
  status: number | null;
  hasConnection: boolean;
  hostname: string | null;
  stderr: string;
}

/** Loads `prisma.config.ts` in a clean child process and inspects `orm.db`. */
function loadConfig(overrides: Record<string, string | undefined>): LoadedConfig {
  const tempCwd = mkdtempSync(join(tmpdir(), 'prisma-config-'));
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    'DIRECT_URL',
    'DATABASE_URL',
    'DATABASE_URL_POOLED',
    'NODE_ENV',
    'NEXT_PHASE',
  ]) {
    delete env[name];
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[name];
    } else {
      env[name] = value;
    }
  }

  const script = `
    const mod = await import(${JSON.stringify(configUrl)});
    const orm = mod.default?.orm ?? {};
    const connection = orm.db?.connection;
    process.stdout.write(JSON.stringify({
      hasConnection: typeof connection === 'string',
      hostname: typeof connection === 'string' ? new URL(connection).hostname : null,
    }));
  `;

  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: tempCwd,
      env,
      encoding: 'utf8',
      timeout: 60_000,
    });

    return {
      status: result.status,
      hasConnection: result.stdout.includes('"hasConnection":true'),
      hostname: /"hostname":"([^"]+)"/.exec(result.stdout)?.[1] ?? null,
      stderr: result.stderr ?? '',
    };
  } finally {
    rmSync(tempCwd, { recursive: true, force: true });
  }
}

describe('prisma.config.ts without database credentials', () => {
  it('loads in production without DIRECT_URL (the prebuild/contract emit case)', () => {
    const loaded = loadConfig({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' });

    expect(loaded.stderr).not.toMatch(/CLI\.CONFIG_UNREADABLE|DIRECT_URL must be set/);
    expect(loaded.status).toBe(0);
    // No `db.connection` → nothing to validate, nothing to connect to.
    expect(loaded.hasConnection).toBe(false);
    expect(loaded.stderr).not.toMatch(/Prisma CLI database connection ignored/);
  });

  it('loads in a plain production runtime without DIRECT_URL', () => {
    const loaded = loadConfig({ NODE_ENV: 'production' });

    expect(loaded.status).toBe(0);
    expect(loaded.hasConnection).toBe(false);
  });
});

describe('prisma.config.ts with a direct connection', () => {
  it('passes a local loopback DIRECT_URL through for migrations', () => {
    const loaded = loadConfig({
      NODE_ENV: 'development',
      DIRECT_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/webradio_dev',
    });

    expect(loaded.status).toBe(0);
    expect(loaded.hasConnection).toBe(true);
    expect(loaded.hostname).toBe('127.0.0.1');
  });

  it('passes the Prisma Postgres direct host through', () => {
    const loaded = loadConfig({
      NODE_ENV: 'development',
      DIRECT_URL: 'postgresql://app:secret@db.prisma.io:5432/postgres',
    });

    expect(loaded.status).toBe(0);
    expect(loaded.hasConnection).toBe(true);
    expect(loaded.hostname).toBe('db.prisma.io');
  });

  it('keeps loading (warning only) when DIRECT_URL is wrong, so the build survives', () => {
    const loaded = loadConfig({
      NODE_ENV: 'production',
      DIRECT_URL: 'postgresql://app:top-secret@pooled.db.prisma.io:5432/postgres',
    });

    expect(loaded.status).toBe(0);
    expect(loaded.hasConnection).toBe(false);
    expect(loaded.stderr).toMatch(/Prisma CLI database connection ignored/);
    expect(loaded.stderr).toMatch(/pooled\.db\.prisma\.io/);
    // Secret-safe: the value itself must never reach the log.
    expect(loaded.stderr).not.toMatch(/top-secret/);
  });
});

describe('build pipeline stays offline', () => {
  const packageJson = JSON.parse(
    readFileSync(join(projectRoot, 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };

  it('never runs migrations during prebuild or build', () => {
    const offlineSteps = [packageJson.scripts['prebuild'], packageJson.scripts['build']];

    for (const step of offlineSteps) {
      expect(step).toBeDefined();
      expect(step).not.toMatch(/db migrat|db update|db init|migration (apply|deploy)/);
    }
    // `prebuild` is exactly the offline contract emission.
    expect(packageJson.scripts['prebuild']).toBe('prisma contract emit');
  });

  it('routes every DB command through the validating wrapper', () => {
    const dbScripts = [
      'db:migrate',
      'db:verify',
      'db:schema',
      'db:status',
      'prisma:db:init',
      'prisma:db:update',
      'prisma:db:migrate',
    ];

    for (const name of dbScripts) {
      expect(packageJson.scripts[name]).toContain('scripts/prisma-db.mts');
    }
  });
});
