#!/usr/bin/env node
/**
 * Wrapper for DB-connected Prisma CLI commands.
 *
 * `prisma contract emit` is offline, but every other DB command needs a real
 * connection. `prisma.config.ts` deliberately does not fail when `DIRECT_URL` is
 * missing (the CLI validates the config eagerly for *all* commands, including
 * the offline `contract emit` in `prebuild`). Without this wrapper a missing or
 * mismatched `DIRECT_URL` surfaces as Prisma's generic
 * `CONFIG.DB_CONNECTION_REQUIRED`.
 *
 * So: resolve with the same shared helper the runtime uses — which rejects a
 * pooled runtime URL, a remote `DATABASE_URL` and any unexpected host, and never
 * prints the connection string — then hand over to the real CLI.
 *
 * Schema-changing commands additionally get a `lock_timeout` through
 * `PGOPTIONS` (see `src/lib/db-cli-options.ts`): a migration that cannot take
 * its `ACCESS EXCLUSIVE` lock aborts instead of waiting forever and blocking
 * every other query on the table. Override with `PRISMA_DB_LOCK_TIMEOUT_MS`.
 *
 * Usage (see package.json):
 *   node scripts/prisma-db.mts db migrate
 *   node scripts/prisma-db.mts db verify --strict
 *   node scripts/prisma-db.mts migration status
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DatabaseConfigError, resolveCliDatabaseUrl } from '../src/lib/db-connection.ts';
import { buildDbCommandEnv, describeLockTimeout } from '../src/lib/db-cli-options.ts';

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  fail(
    'No Prisma command given.\n' +
      'Example: node scripts/prisma-db.mts db migrate\n' +
      'Use `npx prisma contract emit` for the offline contract artefacts.',
  );
}

try {
  // Throws a secret-free DatabaseConfigError when DIRECT_URL is missing,
  // malformed, pooled, or points anywhere but db.prisma.io / loopback.
  const connection = resolveCliDatabaseUrl();
  console.error(`→ Prisma CLI connection: ${connection.source} (${connection.hostname})`);
} catch (error) {
  if (error instanceof DatabaseConfigError) {
    fail(error.message);
  }
  throw error;
}

const require = createRequire(import.meta.url);
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaBin = join(dirname(prismaPackagePath), './dist/prisma.js');

const childEnv = buildDbCommandEnv(process.env, args);
const lockTimeoutNote = describeLockTimeout(process.env, args);
if (lockTimeoutNote !== null) {
  console.error(`→ ${lockTimeoutNote}`);
}

const child = spawn(process.execPath, [prismaBin, ...args], {
  stdio: 'inherit',
  env: { ...childEnv } as NodeJS.ProcessEnv,
});

child.on('error', () => {
  fail('Could not start the Prisma CLI.');
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
