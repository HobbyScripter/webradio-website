#!/usr/bin/env node
/**
 * Acceptance check for the translation-engine migration.
 *
 * Two disposable databases on a **loopback** PostgreSQL server:
 *
 *   1. `webradio_accept_empty_test`  — full chain from an empty database.
 *   2. `webradio_accept_upgrade_test`— chain up to the i18n migration, seed a
 *      real translation row, then apply the engine migration and prove the row
 *      is untouched.
 *
 * Refuses any non-loopback host and any database name not ending in `_test`.
 * Never prints a connection string or a credential. Production is never touched.
 *
 * Usage: node scripts/translation-acceptance-db.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env', quiet: true });
// An explicitly provided TEST_DATABASE_URL (CI, disposable cluster) always wins
// over a developer's stale .env.test entry.
if (!process.env.TEST_DATABASE_URL) {
  dotenv.config({ path: '.env.test', override: true, quiet: true });
}

const EMPTY_DB = 'webradio_accept_empty_test';
const UPGRADE_DB = 'webradio_accept_upgrade_test';
const PRE_ENGINE = '20261124T1823_i18n_content_translations';
const ENGINE_MIGRATION = '20261124T1840_i18n_translation_engine';

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function refuse(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const candidate = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!candidate) {
  refuse('TEST_DATABASE_URL/DATABASE_URL is not set; cannot run the migration acceptance.');
}

const parsed = new URL(candidate);
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
if (!loopback.has(parsed.hostname)) {
  refuse(`Refusing non-loopback host "${parsed.hostname}".`);
}
if (!parsed.pathname.replace(/^\//, '').endsWith('_test')) {
  refuse('The database name must end in _test.');
}

function urlFor(database) {
  const clone = new URL(candidate);
  clone.pathname = `/${database}`;
  return clone.toString();
}

function adminUrl() {
  const clone = new URL(candidate);
  clone.pathname = '/postgres';
  return clone.toString();
}

function createClient(database) {
  return new pg.Client({
    connectionString: urlFor(database),
    ssl: false,
    connectionTimeoutMillis: 10_000,
  });
}

/** Resolve the locally installed Prisma CLI (never rely on a global npx). */
function prismaCli() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('prisma/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma;
  if (!bin) throw new Error('prisma package has no bin entry');
  return path.join(path.dirname(pkgPath), bin);
}

function runPrisma(args, label) {
  const cli = prismaCli();

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
    });
    child.on('error', (error) => {
      record(label, false, `spawn failed: ${error.code ?? 'unknown'}`);
      resolve({ code: 1, out: '' });
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      out += chunk.toString();
    });
    child.on('close', (code) => {
      // The output never contains the URL; it is passed as a separate argument.
      const summary = out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.includes('npm notice'))
        .slice(-6)
        .join(' | ');
      record(label, code === 0, `exit ${code}${summary ? `: ${summary.slice(0, 400)}` : ''}`);
      resolve({ code, out });
    });
  });
}

async function resetDatabase(client, name) {
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  await client.query(`CREATE DATABASE "${name}"`);
}

async function query(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function verifySchema(client, label) {
  const tables = await query(
    client,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const names = tables.map((row) => row.table_name);
  const expected = ['ContentTranslation', 'TranslationEvent', 'TranslationJob', 'TranslationUsage', 'User'];
  record(
    `${label}: tables present`,
    expected.every((table) => names.includes(table)),
    expected.filter((table) => !names.includes(table)).join(', ') || `${names.length} tables`,
  );

  const columns = await query(
    client,
    `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ContentTranslation'
      ORDER BY column_name`,
  );
  const columnNames = columns.map((row) => row.column_name);
  const requiredColumns = [
    'entityType',
    'entityId',
    'locale',
    'field',
    'value',
    'status',
    'provider',
    'sourceHash',
    'outdated',
    'translatedById',
    'reviewedAt',
  ];
  record(
    `${label}: ContentTranslation columns`,
    requiredColumns.every((column) => columnNames.includes(column)),
    requiredColumns.filter((column) => !columnNames.includes(column)).join(', ') || 'all present',
  );

  const userLocale = await query(
    client,
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='User' AND column_name='locale'`,
  );
  record(
    `${label}: User.locale nullable`,
    userLocale.length === 1 && userLocale[0].is_nullable === 'YES',
    userLocale[0]?.is_nullable ?? 'missing',
  );

  const indexes = await query(
    client,
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('ContentTranslation','TranslationJob','TranslationEvent','TranslationUsage')`,
  );
  const indexNames = indexes.map((row) => row.indexdef).join('\n');
  record(
    `${label}: translation indexes`,
    /ContentTranslation_entityType_entityId_locale_field_key|ContentTranslation.*locale.*field/.test(indexNames) &&
      indexNames.includes('TranslationJob_jobKey_key') &&
      indexNames.includes('TranslationUsage_provider_createdAt_idx'),
    `${indexes.length} indexes`,
  );

  const unique = await query(
    client,
    `SELECT conname, contype FROM pg_constraint
      WHERE conrelid IN ('"ContentTranslation"'::regclass, '"TranslationJob"'::regclass)
        AND contype = 'u'`,
  );
  record(
    `${label}: unique constraints`,
    unique.some((row) => row.conname.includes('jobKey')) &&
      unique.some((row) => row.conname.includes('entityType')),
    unique.map((row) => row.conname).join(', ') || 'none',
  );

  const fks = await query(
    client,
    `SELECT conname FROM pg_constraint
      WHERE contype='f'
        AND conrelid IN (
          SELECT oid FROM pg_class WHERE relname IN ('ContentTranslation','TranslationJob','TranslationEvent','TranslationUsage')
        )`,
  );
  record(
    `${label}: no foreign keys from translation tables (denormalised by design)`,
    fks.length === 0,
    fks.map((row) => row.conname).join(', ') || 'none',
  );

  const defaults = await query(
    client,
    `SELECT column_name, column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ContentTranslation' AND column_name IN ('status','value','outdated')`,
  );
  record(
    `${label}: safe defaults`,
    defaults.length === 3,
    defaults.map((row) => `${row.column_name}=${row.column_default}`).join(', '),
  );
}

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl(), ssl: false, connectionTimeoutMillis: 10_000 });
  try {
    await admin.connect();
  } catch (error) {
    refuse(`Local PostgreSQL not reachable (${error.code ?? 'unknown'}); acceptance not executed.`);
  }

  // ---------------------------------------------------------------- empty DB
  try {
    await resetDatabase(admin, EMPTY_DB);
    record('empty database created', true, EMPTY_DB);

    await runPrisma(['db', 'migrate', '--db', urlFor(EMPTY_DB)], 'full chain from empty');
    await runPrisma(['db', 'verify', '--strict', '--db', urlFor(EMPTY_DB)], 'db verify --strict (empty chain)');

    const emptyClient = createClient(EMPTY_DB);
    await emptyClient.connect();
    await verifySchema(emptyClient, 'empty');
    await emptyClient.end();
  } catch (error) {
    record('empty database chain', false, error instanceof Error ? error.message : 'unknown');
  }

  // -------------------------------------------------------------- upgrade DB
  try {
    await resetDatabase(admin, UPGRADE_DB);
    record('upgrade database created', true, UPGRADE_DB);

    await runPrisma(['db', 'migrate', '--db', urlFor(UPGRADE_DB), '--to', PRE_ENGINE], `chain up to ${PRE_ENGINE}`);

    const client = createClient(UPGRADE_DB);
    await client.connect();

    // Seed a realistic pre-existing state: a user, an approved translation and a
    // source plugin. The engine migration must not touch any of it.
    await query(
      client,
      `INSERT INTO "User" ("id","email","passwordHash","role","createdAt","updatedAt")
       VALUES ('user_accept_1','acceptance@example.test','x','ADMIN', now(), now())`,
    );
    await query(
      client,
      `INSERT INTO "ContentTranslation"
         ("id","entityType","entityId","locale","field","value","status","createdAt","updatedAt")
       VALUES ('ct_accept_1','Plugin','plugin-1','en','name','Approved before the engine migration','APPROVED', now(), now())`,
    );
    const before = await query(
      client,
      `SELECT "value","status","updatedAt"::text AS updated FROM "ContentTranslation" WHERE "id"='ct_accept_1'`,
    );

    await runPrisma(['db', 'migrate', '--db', urlFor(UPGRADE_DB)], `apply ${ENGINE_MIGRATION}`);
    await runPrisma(['db', 'verify', '--strict', '--db', urlFor(UPGRADE_DB)], 'db verify --strict (after upgrade)');

    const after = await query(
      client,
      `SELECT "value","status","updatedAt"::text AS updated,"sourceHash","provider","outdated"
         FROM "ContentTranslation" WHERE "id"='ct_accept_1'`,
    );
    record(
      'existing approved translation preserved',
      after.length === 1 &&
        after[0].value === before[0].value &&
        after[0].status === 'APPROVED' &&
        after[0].updated === before[0].updated,
      after.length === 1 ? `value/status/updatedAt unchanged, outdated=${after[0].outdated}` : 'row missing',
    );
    record(
      'existing row got the new nullable columns without data loss',
      after.length === 1 && after[0].sourceHash === null && after[0].provider === null,
      'sourceHash/provider NULL as expected',
    );

    const columnsAfter = await query(
      client,
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ContentTranslation'`,
    );
    record(
      'engine columns added to the existing table',
      ['provider', 'sourceHash', 'outdated'].every((name) =>
        columnsAfter.some((row) => row.column_name === name),
      ),
      columnsAfter.length + ' columns',
    );

    await verifySchema(client, 'upgrade');
    await client.end();
  } catch (error) {
    record('upgrade database chain', false, error instanceof Error ? error.message : 'unknown');
  }

  await admin.end();

  console.log('');
  console.log(JSON.stringify({ total: results.length, failed: failures }, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

await main();
