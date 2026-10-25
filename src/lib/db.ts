/**
 * Prisma 8 Runtime – Database Client Singleton
 *
 * This is the sole entry point for database access in the application.
 * All application code imports `db` (and optionally `contract`) from here.
 *
 * Prisma 8 uses the @prisma/orm-postgres façade.
 * The import paths follow the Prisma 8 specification:
 *   - Runtime factory:   @prisma/orm-postgres/runtime
 *   - Static utilities:  @prisma/orm-postgres/static
 *   - Contract source:   prisma/contract.prisma  (authored)
 *   - Contract artefacts: prisma/contract.json, prisma/contract.d.ts (emitted)
 *
 * NOTE: This module-level singleton is intentional. The Prisma 8 runtime
 * uses a connection pool that must live for the entire process lifetime.
 * Do NOT construct `postgres()` inside request handlers.
 *
 * Connection Configuration:
 * - Production/Vercel runtime: `DATABASE_URL_POOLED` (pooled.db.prisma.io)
 * - Local development/tests:   `DATABASE_URL` (loopback PostgreSQL only)
 * - Prisma CLI operations:     `DIRECT_URL` (db.prisma.io) - prisma.config.ts
 *
 * The rules live in `src/lib/db-connection.ts` so the runtime and the CLI can
 * not drift apart. In production there is no fallback from the pooled runtime
 * URL to a direct one; a missing or mismatched variable aborts with a message
 * that never contains the connection string itself.
 *
 * `postgres()` creates the pool lazily — "The static query surfaces are
 * available at once; the pool is created on the first query or `connect()`"
 * (@prisma/orm-postgres 8.0.0-rc.20, runtime.d.mts). Importing this module
 * during prerendering or `next build` therefore opens no connection, and the
 * build phase uses a loopback placeholder.
 */
// Prisma 8's `pg/timestamptz-temporal@1` codec requires a global `Temporal`.
// Node 26 provides it natively; Node 22 (CI) and older do not, so install the
// spec-compliant polyfill before any query runs. `install()` is a no-op when a
// native implementation already exists.
import 'temporal-polyfill/global';
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract } from '../../prisma/contract.d';
import contractJson from '../../prisma/contract.json' with { type: 'json' };
// Explicit `.ts` extension: the operator CLI scripts import this module with
// Node's native TypeScript support, where extensionless relative imports fail.
import { resolveRuntimeDatabaseUrl } from './db-connection.ts';

/**
 * The typed contract value.
 */
export const contract = contractFromJson<Contract>(contractJson);

/**
 * The resolved runtime connection.
 *
 * Throws `DatabaseConfigError` (secret-safe message) in a production runtime
 * when `DATABASE_URL_POOLED` is missing or does not point at the pooled host.
 */
const runtimeConnection = resolveRuntimeDatabaseUrl();

/**
 * Source of the resolved connection, exposed for diagnostics/health checks.
 * Never contains the URL or its credentials.
 */
export const databaseConnectionSource = runtimeConnection.source;

/**
 * The Prisma 8 database client.
 *
 * Usage:
 *   import { db } from '@/lib/db';
 *   const users = await db.orm.public.User.all();
 */
export const db = postgres({
  contract,
  url: runtimeConnection.url,
  // Each serverless instance owns one module-level pool. Keep bad connections
  // from hanging a request indefinitely and release idle ones early. The URL
  // itself must be the pooled endpoint in production; see docs/DEPLOYMENT.md.
  poolOptions: {
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  },
});
