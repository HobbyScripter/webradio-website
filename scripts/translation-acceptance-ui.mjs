#!/usr/bin/env node
/**
 * Provision the disposable database used for the browser acceptance of
 * `/admin/translations`.
 *
 * Loopback only, database name must end in `_test`, no production access.
 * Prints counts and the disposable test account — never a real secret.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5599/webradio_accept_test \
 *   node scripts/translation-acceptance-ui.mjs
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env', quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  dotenv.config({ path: '.env.test', override: true, quiet: true });
}

const DB = 'webradio_accept_ui_test';
const ADMIN_EMAIL = 'acceptance-admin@example.test';
const USER_EMAIL = 'acceptance-user@example.test';
const PASSWORD = 'Acceptance-Test-2026!';

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const candidate = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!candidate) fail('TEST_DATABASE_URL/DATABASE_URL is not set.');

const parsed = new URL(candidate);
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
if (!loopback.has(parsed.hostname)) fail(`Refusing non-loopback host "${parsed.hostname}".`);
if (!parsed.pathname.replace(/^\//, '').endsWith('_test')) fail('Database name must end in _test.');

const targetUrl = new URL(candidate);
targetUrl.pathname = `/${DB}`;
const adminUrl = new URL(candidate);
adminUrl.pathname = '/postgres';

function prismaCli() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('prisma/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma;
  return path.join(path.dirname(pkgPath), bin);
}

function migrate() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [prismaCli(), 'db', 'migrate', '--db', targetUrl.toString()], {
      cwd: process.cwd(),
      env: process.env,
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk.toString()));
    child.stderr.on('data', (chunk) => (out += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`migrate exit ${code}`))));
  });
}

function hash(text) {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex');
}

const admin = new pg.Client({ connectionString: adminUrl.toString(), ssl: false });
await admin.connect();
await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
  [DB],
);
await admin.query(`DROP DATABASE IF EXISTS "${DB}"`);
await admin.query(`CREATE DATABASE "${DB}"`);
await admin.end();

await migrate();

const passwordHash = await bcrypt.hash(PASSWORD, 10);
const client = new pg.Client({ connectionString: targetUrl.toString(), ssl: false });
await client.connect();

const now = new Date().toISOString();

const newsNormal = {
  id: 'news_accept_normal',
  slug: 'acceptance-normal',
  title: 'WebRadio 2.0 ist da',
  summary: 'Die neue Version bringt schnellere Senderwechsel.',
  content:
    'WebRadio 2.0 ist verfügbar. Die Version 2.0.1 verbessert den Senderwechsel und die Suche.',
};

const newsPrivate = {
  id: 'news_accept_private',
  slug: 'acceptance-private',
  title: 'Kontakt zum Team',
  summary: 'Schreib uns.',
  content: 'Bei Fragen erreichst du uns unter support@example.test jederzeit.',
};

await client.query(
  `INSERT INTO "User" ("id","email","passwordHash","name","role","emailVerified","status","createdAt","updatedAt")
   VALUES ($1,$2,$3,'Acceptance Admin','ADMIN',now(),'ACTIVE',now(),now()),
          ($4,$5,$3,'Acceptance User','USER',now(),'ACTIVE',now(),now())`,
  ['user_accept_admin', ADMIN_EMAIL, passwordHash, 'user_accept_user', USER_EMAIL],
);

await client.query(
  `INSERT INTO "News" ("id","slug","title","summary","content","isPublished","publishedAt","createdAt","updatedAt")
   VALUES ($1,$2,$3,$4,$5,true,now(),now(),now()),
          ($6,$7,$8,$9,$10,true,now(),now(),now())`,
  [
    newsNormal.id,
    newsNormal.slug,
    newsNormal.title,
    newsNormal.summary,
    newsNormal.content,
    newsPrivate.id,
    newsPrivate.slug,
    newsPrivate.title,
    newsPrivate.summary,
    newsPrivate.content,
  ],
);

await client.query(
  `INSERT INTO "Partner" ("id","companyName","description","isFeatured","status","createdAt","updatedAt")
   VALUES ('partner_accept_1','Nordlicht Radio','Wir senden WebRadio aus Hamburg.',true,'ACTIVE',now(),now())`,
);

await client.query(
  `INSERT INTO "LegalDocument" ("id","type","versionNumber","title","content","status","requiresConsent","createdAt","updatedAt","publishedAt")
   VALUES ('legal_accept_1','DATENSCHUTZ',1,'Datenschutzerklärung','Diese Erklärung beschreibt die Verarbeitung personenbezogener Daten.','PUBLISHED',false,now(),now(),now())`,
);

// A human-approved translation (must never be overwritten) and a stale one.
await client.query(
  `INSERT INTO "ContentTranslation" ("id","entityType","entityId","locale","field","value","status","provider","sourceHash","outdated","createdAt","updatedAt")
   VALUES ('ct_accept_approved','News',$1,'en','content',$2,'APPROVED','deepl',$3,false,now(),now()),
          ('ct_accept_stale','News',$1,'pl','title','Stary tytuł','APPROVED','deepl',$4,false,now(),now())`,
  [newsNormal.id, 'Human approved English text.', hash(newsNormal.content), hash('Ein ganz alter Titel')],
);

const counts = await client.query(
  `SELECT
     (SELECT count(*) FROM "User") AS users,
     (SELECT count(*) FROM "News") AS news,
     (SELECT count(*) FROM "Partner") AS partners,
     (SELECT count(*) FROM "LegalDocument") AS legal,
     (SELECT count(*) FROM "ContentTranslation") AS translations`,
);

console.log('database ready:', DB);
console.log('rows:', counts.rows[0]);
console.log('admin login:', ADMIN_EMAIL, '/ disposable password documented in the acceptance report');
console.log('url for the dev server (loopback, trust auth):', targetUrl.toString());

await client.end();
