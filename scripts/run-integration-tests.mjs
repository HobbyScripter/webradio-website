#!/usr/bin/env node
/**
 * Integration test runner.
 *
 * Uses TEST_DATABASE_URL (falling back to DATABASE_URL only when it already
 * points at a `_test` database), refuses non-loopback hosts, and never runs
 * against the development or production database.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';

const candidate = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function refuse(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!candidate) {
  refuse(
    'TEST_DATABASE_URL is not set. Create a disposable PostgreSQL database ' +
      '(name must end in _test) and set TEST_DATABASE_URL in .env.',
  );
}

let parsed;
try {
  parsed = new URL(candidate);
} catch {
  refuse('TEST_DATABASE_URL is not a valid PostgreSQL connection URL.');
}

const databaseName = parsed.pathname.replace(/^\//, '');
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

if (!loopbackHosts.has(parsed.hostname)) {
  refuse(
    `Refusing to run integration tests against non-local host "${parsed.hostname}".`,
  );
}

if (!databaseName.endsWith('_test')) {
  refuse(
    `Refusing to run integration tests against database "${databaseName}"; ` +
      'the database name must end in _test.',
  );
}

const env = {
  ...process.env,
  DATABASE_URL: candidate,
  NODE_ENV: 'test',
};

// Tests must never deliver real e-mail. Removing the provider credentials here
// keeps a developer's `.env` (or a CI secret) from letting a fixture reach
// Resend or an SMTP server; the e-mail tests mock `fetch` explicitly.
for (const key of [
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_SERVER_HOST',
  'EMAIL_SERVER_PORT',
  'EMAIL_SERVER_USER',
  'EMAIL_SERVER_PASSWORD',
]) {
  delete env[key];
}

const jest = spawn(
  process.execPath,
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    '-c',
    'jest.config.integration.mjs',
    '--runInBand',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env },
);

jest.on('error', () => {
  refuse('Could not start Jest.');
});

jest.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
