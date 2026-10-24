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
 */
const rawUrl = process.env['DATABASE_URL'];
const connectionUrl =
  rawUrl && rawUrl.trim() !== ''
    ? rawUrl
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
});
