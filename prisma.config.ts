import 'dotenv/config';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { probeCliDatabaseUrl } from './src/lib/db-connection.ts';

/**
 * Prisma 8 RC Configuration
 *
 * Prisma 8 RC has no `directUrl` field: the CLI uses exactly one connection,
 * resolved by `src/lib/db-connection.ts`:
 *
 *   - `DIRECT_URL` (db.prisma.io) for DB-connected CLI operations,
 *   - no silent fallback to the pooled runtime URL,
 *   - a loopback `DATABASE_URL` only outside production (local development and
 *     CI test databases),
 *   - messages that name the variable and hostname, never the URL or its
 *     credentials.
 *
 * Why this file must not throw (fixed 2026-10):
 *
 *   The CLI evaluates the config for *every* command and validates the `orm`
 *   section eagerly — even for the offline `prisma contract emit` that runs in
 *   `prebuild`. A configuration-time throw therefore broke the Vercel build with
 *   `CLI.CONFIG_UNREADABLE: ... DIRECT_URL must be set`. A lazy `get` for
 *   `db.connection` does not help either; the loader reads it while validating.
 *
 *   `db` is optional in the Prisma 8 config type and only DB-connected commands
 *   read `db.connection`, so the config now passes it only when it actually
 *   resolves. A build needs no database credentials; schema/contract emission
 *   stays offline.
 *
 * The strict check lives where it belongs: `scripts/prisma-db.mts` resolves the
 * URL with the throwing helper before spawning `prisma`, so `npm run db:migrate`
 * and friends fail with a precise message instead of a generic loader error.
 * No migration is ever part of `prebuild`/`build`.
 *
 * Deployed environments:
 * - DATABASE_URL_POOLED: pooled.db.prisma.io (application runtime)
 * - DIRECT_URL:          db.prisma.io         (only for migration/DB commands)
 */

const probe = probeCliDatabaseUrl();

if (probe.status === 'invalid') {
  // Warning only: a broken DIRECT_URL must not fail `next build`. The message is
  // secret-free (variable name and hostname), and DB commands still refuse.
  console.warn(
    `⚠ Prisma CLI database connection ignored: ${probe.reason.split('\n')[0]}\n` +
      '  DB commands (`npm run db:migrate`, `npm run db:verify`) will refuse to run.',
  );
}

const orm = ormConfig({
  contract: './prisma/contract.prisma',
  ...(probe.status === 'resolved' ? { db: { connection: probe.connection.url } } : {}),
});

export default definePrismaConfig({
  orm,
  skills: {
    agents: ['cursor', 'agents', 'devin'],
  },
});
