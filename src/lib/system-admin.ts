/**
 * Audited SYSTEM_ADMIN provisioning.
 *
 * SYSTEM_ADMIN is the highest regular privilege level. It cannot be requested
 * over HTTP: `roleSchema` accepts it for reads, while `assignableRoleSchema`
 * deliberately excludes it. Only this module — called by the operator-only CLI
 * scripts — can create the role.
 *
 * The CLI has database credentials, so the database cannot verify a human. The
 * identity check is therefore explicit:
 *   - a new account is created with a password chosen by the operator,
 *   - an existing account is identified by immutable user id AND matching
 *     e-mail address,
 *   - an existing account must already have a verified e-mail address,
 *   - a human-readable confirmation phrase must be supplied.
 *
 * Every successful operation writes an AuditLog row in the same transaction.
 */
import bcryptjs from 'bcryptjs';
import { or } from '@prisma/orm-postgres/orm-client';
// The explicit extension keeps this module loadable by Node's type-stripping
// ESM loader, which the operator CLI uses (Node does not resolve extensionless
// relative imports in ESM).
import { db } from './db.ts';
import type { Role } from './validations';

export const SYSTEM_ADMIN_BOOTSTRAP_CONFIRM = 'BOOTSTRAP_SYSTEM_ADMIN';
export const SYSTEM_ADMIN_RECOVERY_CONFIRM = 'RECOVER_SYSTEM_ADMIN_CONTROL';
export const SYSTEM_ADMIN_MIN_PASSWORD_LENGTH = 16;

const BCRYPT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SystemAdminBootstrapError extends Error {
  // Declared as a field instead of a TypeScript parameter property: the CLI is
  // executed by Node's type-stripping loader, which does not support parameter
  // properties.
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SystemAdminBootstrapError';
    this.code = code;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertStrongPassword(password: string, email: string): void {
  if (password.length < SYSTEM_ADMIN_MIN_PASSWORD_LENGTH) {
    throw new SystemAdminBootstrapError(
      'WEAK_PASSWORD',
      `Das Passwort muss mindestens ${SYSTEM_ADMIN_MIN_PASSWORD_LENGTH} Zeichen lang sein.`,
    );
  }
  if (password.length > 128) {
    throw new SystemAdminBootstrapError(
      'WEAK_PASSWORD',
      'Das Passwort darf höchstens 128 Zeichen lang sein.',
    );
  }
  if (password.toLowerCase() === email.toLowerCase()) {
    throw new SystemAdminBootstrapError(
      'WEAK_PASSWORD',
      'Das Passwort darf nicht der E-Mail-Adresse entsprechen.',
    );
  }
}

async function lockPrivilegedUsers(tx: {
  orm: typeof db.orm;
}): Promise<
  Awaited<ReturnType<typeof db.orm.public.User.all>>
> {
  return tx.orm.public.User.where((user) =>
    or(user.role.eq('ADMIN'), user.role.eq('SYSTEM_ADMIN')),
  )
    .forNoKeyUpdate()
    .all();
}

/**
 * Create a brand-new SYSTEM_ADMIN account. Refuses once any SYSTEM_ADMIN
 * exists; use recovery explicitly to add another account.
 */
export async function bootstrapNewSystemAdmin(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<{ id: string; email: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email)) {
    throw new SystemAdminBootstrapError(
      'INVALID_EMAIL',
      'Die E-Mail-Adresse ist ungültig.',
    );
  }
  assertStrongPassword(input.password, email);

  const passwordHash = await bcryptjs.hash(input.password, BCRYPT_ROUNDS);
  const name = input.name?.trim() || null;

  return db.transaction(async (tx) => {
    // Serialises concurrent bootstrap attempts and reads the current state in
    // the same transaction as the write.
    const privileged = await lockPrivilegedUsers(tx);
    const existingSystemAdmin = privileged.find(
      (user) => user.role === 'SYSTEM_ADMIN',
    );
    if (existingSystemAdmin) {
      throw new SystemAdminBootstrapError(
        'SYSTEM_ADMIN_EXISTS',
        'Es existiert bereits ein Systemadministrator. Normale Bootstraps sind deaktiviert; nutze den ausdrücklich autorisierten Recovery-Weg.',
      );
    }

    const duplicate = await tx.orm.public.User.first({ email });
    if (duplicate) {
      throw new SystemAdminBootstrapError(
        'EMAIL_EXISTS',
        'Für diese E-Mail-Adresse existiert bereits ein Konto. Nutze den Promote-Modus mit der unveränderlichen User-ID.',
      );
    }

    const created = await tx.orm.public.User.create({
      email,
      passwordHash,
      name,
      role: 'SYSTEM_ADMIN',
      // The operator controls both this CLI invocation and the chosen address.
      // This is the one-time bootstrap account; normal role assignment still
      // requires a verified address.
      emailVerified: Temporal.Now.instant(),
    });

    await tx.orm.public.AuditLog.create({
      userId: created.id,
      action: 'SYSTEM_ADMIN_BOOTSTRAPPED',
      details: JSON.stringify({ method: 'created', promotedExistingUser: false }),
      ipAddress: null,
      userAgent: 'system-admin-bootstrap-cli',
    });

    return { id: created.id, email: created.email };
  });
}

/**
 * Promote an existing, already verified account to SYSTEM_ADMIN. This is the
 * normal bootstrap path when the operator already has an account. Refuses once
 * a SYSTEM_ADMIN exists.
 */
export async function promoteExistingSystemAdmin(input: {
  targetUserId: string;
  targetEmail: string;
}): Promise<{ id: string; email: string; previousRole: Role }> {
  const email = normalizeEmail(input.targetEmail);

  return db.transaction(async (tx) => {
    const privileged = await lockPrivilegedUsers(tx);
    if (privileged.some((user) => user.role === 'SYSTEM_ADMIN')) {
      throw new SystemAdminBootstrapError(
        'SYSTEM_ADMIN_EXISTS',
        'Es existiert bereits ein Systemadministrator. Nutze den ausdrücklich autorisierten Recovery-Weg.',
      );
    }

    const target = await tx.orm.public.User.first({ id: input.targetUserId });
    if (!target) {
      throw new SystemAdminBootstrapError(
        'TARGET_NOT_FOUND',
        'Das angegebene Benutzerkonto existiert nicht.',
      );
    }
    if (target.email !== email) {
      throw new SystemAdminBootstrapError(
        'TARGET_MISMATCH',
        'User-ID und E-Mail-Adresse gehören nicht zum selben Konto.',
      );
    }
    if (target.emailVerified === null) {
      throw new SystemAdminBootstrapError(
        'EMAIL_NOT_VERIFIED',
        'Das Zielkonto muss seine E-Mail-Adresse bestätigt haben, bevor es zum Systemadministrator wird.',
      );
    }
    if (target.role === 'SYSTEM_ADMIN') {
      throw new SystemAdminBootstrapError(
        'ALREADY_SYSTEM_ADMIN',
        'Das Zielkonto ist bereits Systemadministrator.',
      );
    }

    const previousRole = target.role as Role;
    await tx.orm.public.User.where({ id: target.id }).update({
      role: 'SYSTEM_ADMIN',
    });

    await tx.orm.public.AuditLog.create({
      userId: target.id,
      action: 'SYSTEM_ADMIN_BOOTSTRAPPED',
      details: JSON.stringify({
        method: 'promoted-existing',
        targetUserId: target.id,
        previousRole,
        promotedExistingUser: true,
      }),
      ipAddress: null,
      userAgent: 'system-admin-bootstrap-cli',
    });

    return { id: target.id, email: target.email, previousRole };
  });
}

/**
 * Explicitly authorised recovery path for a locked-out operator.
 *
 * It only adds an existing, verified account as another SYSTEM_ADMIN. It never
 * demotes, deletes or changes an existing system administrator, so a malicious
 * or mistaken recovery cannot remove the current control identity.
 */
export async function recoverSystemAdmin(input: {
  targetUserId: string;
  targetEmail: string;
  confirmation: string;
}): Promise<{ id: string; email: string; alreadySystemAdmin: boolean }> {
  if (input.confirmation !== SYSTEM_ADMIN_RECOVERY_CONFIRM) {
    throw new SystemAdminBootstrapError(
      'INVALID_CONFIRMATION',
      `Für den Recovery-Weg ist SYSTEM_ADMIN_RECOVERY_CONFIRM=${SYSTEM_ADMIN_RECOVERY_CONFIRM} erforderlich.`,
    );
  }

  const email = normalizeEmail(input.targetEmail);

  return db.transaction(async (tx) => {
    await lockPrivilegedUsers(tx);

    const target = await tx.orm.public.User.first({ id: input.targetUserId });
    if (!target) {
      throw new SystemAdminBootstrapError(
        'TARGET_NOT_FOUND',
        'Das angegebene Benutzerkonto existiert nicht.',
      );
    }
    if (target.email !== email) {
      throw new SystemAdminBootstrapError(
        'TARGET_MISMATCH',
        'User-ID und E-Mail-Adresse gehören nicht zum selben Konto.',
      );
    }
    if (target.emailVerified === null) {
      throw new SystemAdminBootstrapError(
        'EMAIL_NOT_VERIFIED',
        'Das Zielkonto muss seine E-Mail-Adresse bestätigt haben.',
      );
    }
    if (target.role === 'SYSTEM_ADMIN') {
      return { id: target.id, email: target.email, alreadySystemAdmin: true };
    }

    const previousRole = target.role as Role;
    await tx.orm.public.User.where({ id: target.id }).update({
      role: 'SYSTEM_ADMIN',
    });

    await tx.orm.public.AuditLog.create({
      userId: target.id,
      action: 'SYSTEM_ADMIN_RECOVERED',
      details: JSON.stringify({
        targetUserId: target.id,
        previousRole,
        addedWithoutRemovingExistingAdmins: true,
      }),
      ipAddress: null,
      userAgent: 'system-admin-recovery-cli',
    });

    return { id: target.id, email: target.email, alreadySystemAdmin: false };
  });
}

/** Number of SYSTEM_ADMIN accounts (safe for CLI output). */
export async function countSystemAdmins(): Promise<number> {
  const admins = await db.orm.public.User.where({ role: 'SYSTEM_ADMIN' }).all();
  return admins.length;
}
