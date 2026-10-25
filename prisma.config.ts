import 'dotenv/config';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { resolveCliDatabaseUrl } from './src/lib/db-connection.ts';

/**
 * Prisma 8 RC Configuration
 *
 * Prisma 8 RC no longer has a `directUrl` field: the CLI uses exactly one
 * connection. That connection is resolved by the shared helper in
 * `src/lib/db-connection.ts`, which enforces:
 *
 *   - `DIRECT_URL` (db.prisma.io) for every CLI operation,
 *   - no silent fallback to the pooled runtime URL or to a remote
 *     `DATABASE_URL` in production,
 *   - a loopback `DATABASE_URL` only outside production (local development and
 *     CI test databases),
 *   - error messages that name the variable and hostname but never print the
 *     connection string or its credentials.
 *
 * Runtime application traffic uses `DATABASE_URL_POOLED` in `src/lib/db.ts`.
 *
 * Vercel environment variables:
 * - DATABASE_URL_POOLED: pooled.db.prisma.io (runtime)
 * - DIRECT_URL:          db.prisma.io         (CLI/migrations, also required so
 *                                             `prisma contract emit` can load
 *                                             this config during the build)
 */

const cliConnection = resolveCliDatabaseUrl();

export default definePrismaConfig({
  orm: ormConfig({
    contract: './prisma/contract.prisma',
    db: {
      // CLI tools (migrations, db status, contract emit) use DIRECT_URL.
      connection: cliConnection.url,
    },
  }),
  skills: {
    agents: ['claude', 'cursor', 'agents', 'devin'],
  },
});
