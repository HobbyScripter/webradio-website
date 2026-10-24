#!/usr/bin/env node
/**
 * One-time administrator bootstrap (CLI only).
 *
 * Why a CLI and not an HTTP endpoint:
 *   - there is no public surface an attacker could call,
 *   - it needs shell access plus the database credentials,
 *   - it refuses to run as soon as an administrator exists, so it is
 *     effectively disabled after the first successful run.
 *
 * Required environment variables:
 *   ADMIN_BOOTSTRAP_CONFIRM=1     explicit opt-in for this single run
 *   BOOTSTRAP_ADMIN_EMAIL=...     operator-chosen email
 *   BOOTSTRAP_ADMIN_PASSWORD=...  at least 12 characters, never a default
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_CONFIRM=1 \
 *   BOOTSTRAP_ADMIN_EMAIL="admin@example.com" \
 *   BOOTSTRAP_ADMIN_PASSWORD="<generated password>" \
 *   npm run admin:bootstrap
 *
 * Afterwards: remove the three variables from your shell and .env.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db.ts';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.env['ADMIN_BOOTSTRAP_CONFIRM'] !== '1') {
    fail(
      'Refusing to run. Set ADMIN_BOOTSTRAP_CONFIRM=1 for this single invocation.',
    );
  }

  const rawEmail = process.env['BOOTSTRAP_ADMIN_EMAIL']?.trim();
  const password = process.env['BOOTSTRAP_ADMIN_PASSWORD'];
  const name = process.env['BOOTSTRAP_ADMIN_NAME']?.trim() || null;

  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    fail('BOOTSTRAP_ADMIN_EMAIL must be set to a valid email address.');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    fail(
      `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password.toLowerCase() === rawEmail) {
    fail('The password must not be the email address.');
  }
  if (!process.env['DATABASE_URL']) {
    fail('DATABASE_URL is not set.');
  }

  const email = rawEmail.toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await db.transaction(async (tx) => {
    // Authority lives in the database: any existing ADMIN disables bootstrap.
    const existingAdmins = await tx.orm.public.User.where({ role: 'ADMIN' }).all();
    if (existingAdmins.length > 0) {
      return { outcome: 'already-initialised' as const, adminCount: existingAdmins.length };
    }

    const existingUser = await tx.orm.public.User.first({ email });

    if (existingUser) {
      // Promote the operator-chosen existing account instead of creating a
      // duplicate. Still gated by "no ADMIN exists yet".
      await tx.orm.public.User.where({ id: existingUser.id }).update({
        role: 'ADMIN',
        // The operator controls shell and database access. Treat that as
        // sufficient verification for the one-time bootstrap account; normal
        // role changes still require a verified address.
        emailVerified: Temporal.Now.instant(),
      });
      await tx.orm.public.AuditLog.create({
        userId: existingUser.id,
        action: 'ADMIN_BOOTSTRAPPED',
        details: JSON.stringify({ email, promotedExistingUser: true }),
        ipAddress: null,
        userAgent: 'bootstrap-cli',
      });
      return {
        outcome: 'promoted' as const,
        id: existingUser.id,
        email: existingUser.email,
      };
    }

    const created = await tx.orm.public.User.create({
      email,
      passwordHash,
      name,
      role: 'ADMIN',
      emailVerified: Temporal.Now.instant(),
    });

    await tx.orm.public.AuditLog.create({
      userId: created.id,
      action: 'ADMIN_BOOTSTRAPPED',
      details: JSON.stringify({ email, promotedExistingUser: false }),
      ipAddress: null,
      userAgent: 'bootstrap-cli',
    });

    return { outcome: 'created' as const, id: created.id, email: created.email };
  });

  if (result.outcome === 'already-initialised') {
    fail(
      `Bootstrap disabled: ${result.adminCount} administrator account(s) already exist.`,
    );
  }

  console.log(`✔ Administrator ${result.outcome}: ${result.email}`);
  console.log(`  user id: ${result.id}`);
  console.log('  audit action: ADMIN_BOOTSTRAPPED');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Remove ADMIN_BOOTSTRAP_CONFIRM, BOOTSTRAP_ADMIN_EMAIL and');
  console.log('     BOOTSTRAP_ADMIN_PASSWORD from your shell and .env.');
  console.log('  2. Sign in and change the password if it was shared out-of-band.');
  console.log('  3. Further roles are managed via POST /api/admin/users/role.');
}

main()
  .catch((error: unknown) => {
    // Never echo the password, hash or connection string.
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error(`✖ Bootstrap failed (${name}). Check DATABASE_URL and the server log.`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
