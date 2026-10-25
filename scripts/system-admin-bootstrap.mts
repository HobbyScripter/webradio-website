#!/usr/bin/env node
/**
 * Operator-only CLI for the highest privilege level.
 *
 * Normal bootstrap (creates a new account or promotes a verified existing one):
 *   SYSTEM_ADMIN_BOOTSTRAP_CONFIRM=BOOTSTRAP_SYSTEM_ADMIN \
 *   SYSTEM_ADMIN_EMAIL="operator@example.com" \
 *   SYSTEM_ADMIN_PASSWORD="<generated password, at least 16 characters>" \
 *   npm run system-admin:bootstrap
 *
 * Promote an existing verified account:
 *   SYSTEM_ADMIN_BOOTSTRAP_CONFIRM=BOOTSTRAP_SYSTEM_ADMIN \
 *   SYSTEM_ADMIN_TARGET_ID="<user uuid>" \
 *   SYSTEM_ADMIN_TARGET_EMAIL="operator@example.com" \
 *   npm run system-admin:bootstrap
 *
 * Locked-out recovery (adds a second account; never removes the current one):
 *   SYSTEM_ADMIN_RECOVERY=1 \
 *   SYSTEM_ADMIN_RECOVERY_CONFIRM=RECOVER_SYSTEM_ADMIN_CONTROL \
 *   SYSTEM_ADMIN_TARGET_ID="<user uuid>" \
 *   SYSTEM_ADMIN_TARGET_EMAIL="operator@example.com" \
 *   npm run system-admin:recover
 *
 * No password, hash, token or connection string is printed. The scripts are
 * deliberately not reachable over HTTP and must be run by someone with shell
 * access and database credentials.
 */
import 'dotenv/config';
import { db } from '../src/lib/db.ts';
import {
  SYSTEM_ADMIN_BOOTSTRAP_CONFIRM,
  SYSTEM_ADMIN_RECOVERY_CONFIRM,
  SystemAdminBootstrapError,
  bootstrapNewSystemAdmin,
  promoteExistingSystemAdmin,
  recoverSystemAdmin,
} from '../src/lib/system-admin.ts';

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!process.env['DATABASE_URL_POOLED'] && !process.env['DATABASE_URL']) {
    fail(
      'No database connection configured. Set DATABASE_URL_POOLED (or a loopback DATABASE_URL for local development).',
    );
  }

  const recovery = process.env['SYSTEM_ADMIN_RECOVERY'] === '1';
  const targetId = process.env['SYSTEM_ADMIN_TARGET_ID']?.trim();
  const targetEmail = process.env['SYSTEM_ADMIN_TARGET_EMAIL']?.trim();
  const newEmail = process.env['SYSTEM_ADMIN_EMAIL']?.trim();
  const newPassword = process.env['SYSTEM_ADMIN_PASSWORD'];
  const name = process.env['SYSTEM_ADMIN_NAME']?.trim() || null;

  if (recovery) {
    const confirmation = process.env['SYSTEM_ADMIN_RECOVERY_CONFIRM'];
    if (confirmation !== SYSTEM_ADMIN_RECOVERY_CONFIRM) {
      fail(
        `Recovery requires SYSTEM_ADMIN_RECOVERY_CONFIRM=${SYSTEM_ADMIN_RECOVERY_CONFIRM}.`,
      );
    }
    if (!targetId || !targetEmail) {
      fail(
        'Recovery requires SYSTEM_ADMIN_TARGET_ID and SYSTEM_ADMIN_TARGET_EMAIL.',
      );
    }
    if (newEmail || newPassword) {
      fail(
        'Recovery does not create accounts. Remove SYSTEM_ADMIN_EMAIL and SYSTEM_ADMIN_PASSWORD.',
      );
    }

    const result = await recoverSystemAdmin({
      targetUserId: targetId,
      targetEmail,
      confirmation,
    });

    console.log(
      result.alreadySystemAdmin
        ? '✔ Das Zielkonto ist bereits Systemadministrator; es wurde nichts geändert.'
        : '✔ Recovery abgeschlossen: Das bestehende Konto wurde als weiterer Systemadministrator freigeschaltet.',
    );
    console.log(`  user id: ${result.id}`);
    console.log('  audit action: SYSTEM_ADMIN_RECOVERED');
    return;
  }

  const confirmation = process.env['SYSTEM_ADMIN_BOOTSTRAP_CONFIRM'];
  if (confirmation !== SYSTEM_ADMIN_BOOTSTRAP_CONFIRM) {
    fail(
      `Refusing to run. Set SYSTEM_ADMIN_BOOTSTRAP_CONFIRM=${SYSTEM_ADMIN_BOOTSTRAP_CONFIRM} for this single invocation.`,
    );
  }

  if (targetId || targetEmail) {
    if (!targetId || !targetEmail) {
      fail(
        'The promote mode requires both SYSTEM_ADMIN_TARGET_ID and SYSTEM_ADMIN_TARGET_EMAIL.',
      );
    }
    if (newEmail || newPassword) {
      fail(
        'Use either the create mode (SYSTEM_ADMIN_EMAIL/PASSWORD) or the promote mode (TARGET_ID/TARGET_EMAIL), not both.',
      );
    }

    const result = await promoteExistingSystemAdmin({
      targetUserId: targetId,
      targetEmail,
    });
    console.log('✔ Bestehendes Konto zum Systemadministrator befördert.');
    console.log(`  user id: ${result.id}`);
    console.log(`  previous role: ${result.previousRole}`);
    console.log('  audit action: SYSTEM_ADMIN_BOOTSTRAPPED');
    return;
  }

  if (!newEmail || !newPassword) {
    fail(
      'Create mode requires SYSTEM_ADMIN_EMAIL and SYSTEM_ADMIN_PASSWORD (at least 16 characters).',
    );
  }

  const result = await bootstrapNewSystemAdmin({
    email: newEmail,
    password: newPassword,
    name,
  });

  console.log('✔ Systemadministrator-Konto erstellt.');
  console.log(`  user id: ${result.id}`);
  console.log('  audit action: SYSTEM_ADMIN_BOOTSTRAPPED');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Remove SYSTEM_ADMIN_* variables from your shell and .env.');
  console.log('  2. Sign in and change the password if it was shared out-of-band.');
  console.log('  3. Normal ADMIN role changes remain available via the admin API;');
  console.log('     SYSTEM_ADMIN can only be granted through this CLI or recovery.');
}

main()
  .catch((error: unknown) => {
    if (error instanceof SystemAdminBootstrapError) {
      console.error(`✖ ${error.message} (${error.code})`);
    } else {
      const name = error instanceof Error ? error.name : 'UnknownError';
      console.error(
        `✖ System-admin bootstrap failed (${name}). Check DATABASE_URL_POOLED and the server log.`,
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
