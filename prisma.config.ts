import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

/**
 * Prisma 8 RC Configuration
 *
 * Migrationen und CLI-Tools verwenden DIRECT_URL (direct connection to db.prisma.io).
 * Runtime-Anwendungsverkehr verwendet DATABASE_URL (pooled connection to pooled.db.prisma.io).
 *
 * Prisma 8 RC entfernt `directUrl` aus prisma.config.ts und unterstützt keine native
 * Trennung in der Konfiguration. Daher verwenden wir DIRECT_URL für CLI-Operationen.
 *
 * Env-Variablen in Vercel:
 * - DATABASE_URL: pooled.db.prisma.io (für Runtime, src/lib/db.ts)
 * - DIRECT_URL: db.prisma.io (für Migrationen, prisma.config.ts)
 */
export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    db: {
      // CLI-Tools (Migrationen, db status, etc.) verwenden DIRECT_URL
      connection: process.env["DIRECT_URL"] || process.env["DATABASE_URL"]!,
    },
  }),
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});
