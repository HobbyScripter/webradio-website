#!/usr/bin/env node
/**
 * i18n coverage audit.
 *
 * Reports two things the test suite cannot see:
 *
 * 1. **Interface keys** — structural drift of `src/i18n/messages/*.json` against
 *    the German source (the unit test fails on this too; the audit is the
 *    human-readable overview).
 * 2. **Hard-coded copy** — German UI text that is still written directly in a
 *    component or page instead of a message key. This is the work list for the
 *    remaining translation passes.
 *
 * It exits with status 1 when a locale is structurally incomplete or when
 * `--strict` is passed and hard-coded copy remains, so CI can gate a release on
 * it once the migration is finished.
 *
 * Usage:
 *   node scripts/i18n-audit.mjs
 *   node scripts/i18n-audit.mjs --json
 *   node scripts/i18n-audit.mjs --strict
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MESSAGES_DIR = path.join(ROOT, 'src', 'i18n', 'messages');
const SCAN_DIRS = [path.join(ROOT, 'src', 'app'), path.join(ROOT, 'src', 'components')];
const IGNORED_DIRS = new Set(['__tests__', 'node_modules']);
const LOCALES = ['de', 'en', 'nl', 'fr', 'es', 'it', 'pl'];
const SOURCE = 'de';

/** Wörter, die auf deutschen UI-Text hindeuten (Heuristik, kein Beweis). */
const GERMAN_MARKERS =
  /(\b(der|die|das|und|oder|nicht|kein|keine|wird|werden|wurde|bitte|dein|deine|für|über|kann|konnte|muss|soll|alle|mehr|neu|laden|löschen|speichern|zurück|weiter|anmelden|abmelden|registrieren|passwort|benutzer|konto|seite|einstellungen|sicherheit|sprache|hinweis|fehler|erfolgreich|ausgewählt|gesperrt)\b|[äöüÄÖÜß])/;

async function readTree(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readTree(full)));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function flatten(tree, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[full] = value;
    else flatten(value, full, out);
  }
  return out;
}

/**
 * Heuristic scan for German copy in JSX text and aria/placeholder/title
 * attributes. It deliberately skips translation calls and code comments.
 */
function findHardCodedCopy(source, file) {
  const findings = [];
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const lines = withoutComments.split('\n');

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Skip anything that is already a translation call or an import.
    if (/\bt\(|\bt\(`|i18n|getTranslator|createServerI18n|roleLabel/.test(trimmed)) return;

    // JSX text nodes: >text< on one line.
    const jsxText = [...trimmed.matchAll(/>([^<>{}\n]{3,})</g)].map((m) => m[1].trim());
    // Attributes that end up visible to a user.
    const attributeText = [
      ...trimmed.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]{3,})"/g),
    ].map((m) => m[1]);

    for (const candidate of [...jsxText, ...attributeText]) {
      if (!/[A-Za-zÄÖÜäöüß]/.test(candidate)) continue;
      if (!GERMAN_MARKERS.test(candidate)) continue;
      findings.push({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        line: index + 1,
        text: candidate.slice(0, 120),
      });
    }
  });

  return findings;
}

const catalogue = {};
for (const locale of LOCALES) {
  const raw = await readFile(path.join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  catalogue[locale] = flatten(JSON.parse(raw));
}

const sourceKeys = Object.keys(catalogue[SOURCE]);
const interfaceReport = LOCALES.map((locale) => {
  const keys = Object.keys(catalogue[locale]);
  if (locale === SOURCE) {
    return { locale, keys: keys.length, missing: [], extra: [], complete: true };
  }
  const missing = sourceKeys.filter((key) => !(key in catalogue[locale]));
  const extra = keys.filter((key) => !(key in catalogue[SOURCE]));
  return { locale, keys: keys.length, missing, extra, complete: missing.length === 0 && extra.length === 0 };
});

const findings = [];
for (const dir of SCAN_DIRS) {
  for (const file of await readTree(dir)) {
    findings.push(...findHardCodedCopy(await readFile(file, 'utf8'), file));
  }
}

const byFile = new Map();
for (const finding of findings) {
  byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + 1);
}
const hardCodedFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]);

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');

if (json) {
  console.log(
    JSON.stringify(
      {
        interface: interfaceReport,
        hardCoded: { total: findings.length, files: Object.fromEntries(hardCodedFiles) },
      },
      null,
      2,
    ),
  );
} else {
  console.log('WebRadio i18n audit\n');
  console.log(`Source language: ${SOURCE} (${sourceKeys.length} keys)\n`);
  for (const entry of interfaceReport) {
    const status = entry.complete
      ? 'complete'
      : `missing ${entry.missing.length}` + (entry.extra.length ? `, extra ${entry.extra.length}` : '');
    console.log(`  ${entry.locale}  ${String(entry.keys).padStart(4)} keys  ${status}`);
    if (!entry.complete) {
      for (const key of entry.missing.slice(0, 10)) console.log(`      - ${key}`);
      if (entry.missing.length > 10) console.log(`      … ${entry.missing.length - 10} more`);
    }
  }

  console.log(`\nHard-coded German UI strings (heuristic): ${findings.length}`);
  if (hardCodedFiles.length) {
    for (const [file, count] of hardCodedFiles) console.log(`  ${String(count).padStart(4)}  ${file}`);
  }
  console.log(
    '\nThese are the files still to migrate to message keys. See docs/INTERNATIONALIZATION_IMPLEMENTATION_REPORT.md.',
  );
}

const incomplete = interfaceReport.filter((entry) => !entry.complete);
if (incomplete.length > 0 || (strict && findings.length > 0)) {
  process.exitCode = 1;
}
