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

/**
 * The typed contract value.
 */
export const contract = contractFromJson<Contract>(contractJson);

/**
 * Database connection URL resolution:
 * Uses DATABASE_URL if non-empty, or a placeholder during build/evaluation time
 * so static analysis and Next.js page collection succeed before live credentials are provided.
 *
 * The placeholder is build-time only. At runtime in production a missing
 * DATABASE_URL must fail loudly: silently dialling a local placeholder would
 * turn a configuration mistake into a confusing connection error on the first
 * request. `next build` runs with NODE_ENV=production, so the build phase is
 * detected separately (Next sets NEXT_PHASE itself).
 */
const rawUrl = process.env['DATABASE_URL'];
const hasDatabaseUrl = Boolean(rawUrl && rawUrl.trim() !== '');
const isBuildPhase = process.env['NEXT_PHASE'] === 'phase-production-build';

if (!hasDatabaseUrl && process.env['NODE_ENV'] === 'production' && !isBuildPhase) {
  throw new Error(
    'DATABASE_URL must be set at runtime in production.\n' +
      'Configure it in the deployment environment; see docs/DEPLOYMENT.md.',
  );
}

const connectionUrl = hasDatabaseUrl
  ? (rawUrl as string)
  : 'postgresql://placeholder:placeholder@localhost:5432/webradio_placeholder';

/**
 * The Prisma 8 database client.
 *
 * Usage:
 *   import { db } from '@/lib/db';
 *   const users = await db.orm.public.User.all();
 */
export const db = postgres({
  contract,
  url: connectionUrl,
  // Each serverless instance owns one module-level pool. Keep bad connections
  // from hanging a request indefinitely and release idle ones early. A
  // production deployment behind Vercel should additionally use a pooled
  // connection string; see docs/DEPLOYMENT.md.
  poolOptions: {
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  },
});
