/**
 * Abuse reports.
 *
 * A report is a pointer, never a verdict: submitting one changes nothing about
 * the reported content. Only an administrator decision acts, and every decision
 * is audited with the acting admin and a reason.
 *
 * The reported text is stored as plain text and rendered with
 * `whitespace-pre-line` (never `dangerouslySetInnerHTML`), so a report can not
 * inject markup into an admin page.
 */
import { db } from './db';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from './auth-service';
import { ConflictError as BaseConflictError } from './developer-catalog-service';
import { applyTakedownInTransaction } from './catalog-moderation-service';
import { suspendAccount } from './account-suspension';
import { hasRole, isAccountAccessible } from './roles';
import type { Role } from './validations';

export const REPORT_DETAILS_MAX_LENGTH = 2000;
export const REPORT_NOTES_MIN_LENGTH = 10;

export type ReportTargetType =
  | 'PLUGIN'
  | 'THEME'
  | 'PLUGIN_VERSION'
  | 'THEME_VERSION';
export type ReportReason =
  | 'ILLEGAL'
  | 'MALWARE'
  | 'COPYRIGHT'
  | 'SPAM'
  | 'MISLEADING'
  | 'OTHER';
export type ReportStatus =
  | 'OPEN'
  | 'DISMISSED'
  | 'CONTENT_REMOVED'
  | 'WARNING_ISSUED'
  | 'ACCOUNT_SUSPENDED';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const REPORT_LOCK_NAMESPACE = 864201503;

function lockKey(tx: Transaction, subject: string) {
  return tx.execute(
    tx.raw
      .sql`SELECT pg_advisory_xact_lock(${REPORT_LOCK_NAMESPACE}, hashtext(${subject}))`
      .affectedCount()
      .build(),
  );
}

function normalizeDetails(details: string | undefined): string | null {
  const trimmed = details?.trim() ?? '';
  if (trimmed.length > REPORT_DETAILS_MAX_LENGTH) {
    throw new AuthError(
      `Der Meldungstext darf höchstens ${REPORT_DETAILS_MAX_LENGTH} Zeichen lang sein.`,
      400,
      'VALIDATION_ERROR',
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNotes(notes: string | undefined): string {
  const trimmed = notes?.trim() ?? '';
  if (trimmed.length < REPORT_NOTES_MIN_LENGTH) {
    throw new AuthError(
      `Eine Entscheidung erfordert eine Begründung mit mindestens ${REPORT_NOTES_MIN_LENGTH} Zeichen.`,
      400,
      'NOTES_REQUIRED',
    );
  }
  return trimmed;
}

export type ResolvedReportTarget = {
  kind: 'PLUGIN' | 'THEME';
  entryId: string;
  ownerUserId: string | null;
  /** Display label built from the stored entry; never from the request body. */
  label: string;
};

export type ResolveReportTargetOptions = {
  /**
   * Restrict resolution to entries the public catalogue actually serves.
   *
   * Reporter-facing callers must set this, so an id alone can not disclose the
   * name of a draft, unpublished, rejected or `REMOVED` entry. Admin decision
   * paths resolve without the filter, because they must still act on content
   * that is no longer public.
   */
  publicOnly?: boolean;
};

/**
 * Resolve a report target to the catalogue entry that would be acted on.
 * Returns null for unknown, already deleted or (with `publicOnly`) not publicly
 * visible targets, so the API can answer 404 without echoing whether other
 * content exists.
 */
export async function resolveReportTarget(
  targetType: ReportTargetType,
  targetId: string,
  options: ResolveReportTargetOptions = {},
): Promise<ResolvedReportTarget | null> {
  let kind: 'PLUGIN' | 'THEME';
  let entryId: string;
  let versionLabel: string | null = null;

  if (targetType === 'PLUGIN' || targetType === 'PLUGIN_VERSION') {
    kind = 'PLUGIN';
    if (targetType === 'PLUGIN') {
      entryId = targetId;
    } else {
      const version = await db.orm.public.PluginVersion.first({ id: targetId });
      if (!version) {
        return null;
      }
      entryId = version.pluginId;
      versionLabel = version.version;
    }
  } else {
    kind = 'THEME';
    if (targetType === 'THEME') {
      entryId = targetId;
    } else {
      const version = await db.orm.public.ThemeVersion.first({ id: targetId });
      if (!version) {
        return null;
      }
      entryId = version.themeId;
      versionLabel = version.version;
    }
  }

  const entry =
    kind === 'PLUGIN'
      ? await db.orm.public.Plugin.first({ id: entryId })
      : await db.orm.public.Theme.first({ id: entryId });

  if (!entry) {
    return null;
  }

  // The public catalogue serves exactly an approved, published entry (see the
  // shared filters in `catalog.ts`). A version row has no status of its own, so
  // the parent entry decides.
  if (options.publicOnly && !(entry.status === 'APPROVED' && entry.isPublished)) {
    return null;
  }

  const profile = await db.orm.public.DeveloperProfile.first({
    id: entry.developerId,
  });

  const kindLabel = kind === 'PLUGIN' ? 'Plugin' : 'Theme';
  const label = versionLabel
    ? `${kindLabel} „${entry.name}“ – Version ${versionLabel}`
    : `${kindLabel} „${entry.name}“`;

  return { kind, entryId: entry.id, ownerUserId: profile?.userId ?? null, label };
}

/**
 * File a report. A repeat of the same reporter/target pair answers 409; the
 * unique constraint in the database is the final barrier, the advisory lock
 * closes the check-then-insert window.
 */
export async function submitReport(input: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ id: string }> {
  const details = normalizeDetails(input.details);

  const reporter = await db.orm.public.User.first({ id: input.reporterId });
  if (!reporter) {
    throw new UnauthorizedError();
  }
  if (!isAccountAccessible(reporter.status, reporter.suspendedUntil)) {
    throw new ForbiddenError('Ein gesperrtes Konto kann keine Meldung einreichen.');
  }

  // Reporter-facing: only what the public catalogue serves may be resolved, so
  // a guessed id can not reveal a draft, unpublished or removed entry.
  const target = await resolveReportTarget(input.targetType, input.targetId, {
    publicOnly: true,
  });
  if (!target) {
    throw new NotFoundError('Das gemeldete Ziel wurde nicht gefunden.');
  }

  return db.transaction(async (tx) => {
    await lockKey(
      tx,
      `report:${input.reporterId}:${input.targetType}:${input.targetId}`,
    );

    const existing = await tx.orm.public.ContentReport.first({
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    if (existing) {
      throw new BaseConflictError(
        'Dieses Ziel wurde von dir bereits gemeldet.',
        'DUPLICATE_REPORT',
      );
    }

    const report = await tx.orm.public.ContentReport.create({
      reporterId: input.reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details,
      status: 'OPEN',
    });

    // The report text itself is deliberately not copied into the audit log:
    // it is unverified user content and may contain personal data.
    await tx.orm.public.AuditLog.create({
      userId: input.reporterId,
      action: 'CONTENT_REPORT_SUBMITTED',
      details: JSON.stringify({
        reportId: report.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return { id: report.id };
  });
}

/** Reports of one user, newest first. */
export async function listOwnReports(reporterId: string) {
  return db.orm.public.ContentReport.where({ reporterId })
    .orderBy((report) => report.createdAt.desc())
    .all();
}

/** Admin queue. */
export async function listReports(status?: ReportStatus) {
  const where = status ? { status } : {};
  return db.orm.public.ContentReport.where(where)
    .orderBy((report) => report.createdAt.desc())
    .all();
}

export async function countOpenReports(): Promise<number> {
  const rows = await db.orm.public.ContentReport.where({ status: 'OPEN' }).all();
  return rows.length;
}

async function resolveActingAdmin(tx: Transaction, actorId: string) {
  const actor = await tx.orm.public.User.first({ id: actorId });
  if (!actor) {
    throw new UnauthorizedError();
  }
  if (!hasRole(actor.role as Role, 'ADMIN')) {
    throw new ForbiddenError('Für Moderationsentscheidungen ist die Administratorrolle erforderlich.');
  }
  if (!isAccountAccessible(actor.status, actor.suspendedUntil)) {
    throw new ForbiddenError('Ein gesperrtes Konto kann keine Meldungen bearbeiten.');
  }
  return actor;
}

/**
 * Close an open report. Refuses a second decision on the same report, which is
 * what a double-submitted admin form produces.
 */
async function closeReport(
  tx: Transaction,
  input: {
    reportId: string;
    actorId: string;
    status: Exclude<ReportStatus, 'OPEN'>;
    notes: string;
  },
) {
  await lockKey(tx, `report-decision:${input.reportId}`);

  const report = await tx.orm.public.ContentReport.first({ id: input.reportId });
  if (!report) {
    throw new NotFoundError('Meldung nicht gefunden.');
  }
  if (report.status !== 'OPEN') {
    throw new BaseConflictError(
      'Diese Meldung wurde bereits entschieden.',
      'REPORT_ALREADY_DECIDED',
    );
  }

  await tx.orm.public.ContentReport.where({ id: report.id }).update({
    status: input.status,
    resolutionNotes: input.notes,
    resolvedById: input.actorId,
    resolvedAt: Temporal.Now.instant(),
  });

  return report;
}

async function auditDecision(
  tx: Transaction,
  input: {
    actorId: string;
    action: string;
    reportId: string;
    extra?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  },
) {
  await tx.orm.public.AuditLog.create({
    userId: input.actorId,
    action: input.action,
    details: JSON.stringify({ reportId: input.reportId, ...input.extra }),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

/** Dismiss a report: a report that is not substantiated changes nothing. */
export async function dismissReport(input: {
  actorId: string;
  reportId: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const notes = normalizeNotes(input.notes);

  await db.transaction(async (tx) => {
    await resolveActingAdmin(tx, input.actorId);
    const report = await closeReport(tx, {
      reportId: input.reportId,
      actorId: input.actorId,
      status: 'DISMISSED',
      notes,
    });
    await auditDecision(tx, {
      actorId: input.actorId,
      action: 'CONTENT_REPORT_DISMISSED',
      reportId: report.id,
      extra: { targetType: report.targetType, targetId: report.targetId },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

/**
 * Remove the reported content and close the report in one transaction: a
 * takedown can not happen without a recorded decision, and the report can not be
 * closed as "removed" without the content actually being removed.
 */
export async function removeReportedContent(input: {
  actorId: string;
  reportId: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const notes = normalizeNotes(input.notes);

  await db.transaction(async (tx) => {
    await resolveActingAdmin(tx, input.actorId);

    const report = await tx.orm.public.ContentReport.first({ id: input.reportId });
    if (!report) {
      throw new NotFoundError('Meldung nicht gefunden.');
    }
    if (report.status !== 'OPEN') {
      throw new BaseConflictError(
        'Diese Meldung wurde bereits entschieden.',
        'REPORT_ALREADY_DECIDED',
      );
    }

    const target = await resolveReportTarget(report.targetType, report.targetId);
    if (!target) {
      throw new NotFoundError('Das gemeldete Ziel existiert nicht mehr.');
    }

    await applyTakedownInTransaction(tx, {
      actorId: input.actorId,
      kind: target.kind,
      entryId: target.entryId,
      notes,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await closeReport(tx, {
      reportId: report.id,
      actorId: input.actorId,
      status: 'CONTENT_REMOVED',
      notes,
    });

    await auditDecision(tx, {
      actorId: input.actorId,
      action: 'CONTENT_REPORT_RESOLVED_CONTENT_REMOVED',
      reportId: report.id,
      extra: { targetType: report.targetType, targetId: report.targetId },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

/**
 * Warn the account behind the reported content. E-mail delivery is paused, so
 * the warning exists as an audit record plus the account's own audit history;
 * nothing claims that a message was sent.
 */
export async function warnReportedAccount(input: {
  actorId: string;
  reportId: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const notes = normalizeNotes(input.notes);

  await db.transaction(async (tx) => {
    await resolveActingAdmin(tx, input.actorId);

    const report = await tx.orm.public.ContentReport.first({ id: input.reportId });
    if (!report) {
      throw new NotFoundError('Meldung nicht gefunden.');
    }
    if (report.status !== 'OPEN') {
      throw new BaseConflictError(
        'Diese Meldung wurde bereits entschieden.',
        'REPORT_ALREADY_DECIDED',
      );
    }

    const target = await resolveReportTarget(report.targetType, report.targetId);
    if (!target?.ownerUserId) {
      throw new NotFoundError('Das gemeldete Ziel hat kein zuordenbares Konto.');
    }

    await tx.orm.public.AuditLog.create({
      userId: target.ownerUserId,
      action: 'USER_WARNED',
      details: JSON.stringify({
        reportId: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        issuedBy: input.actorId,
        emailSent: false,
      }),
      ipAddress: null,
      userAgent: null,
    });

    await closeReport(tx, {
      reportId: report.id,
      actorId: input.actorId,
      status: 'WARNING_ISSUED',
      notes,
    });

    await auditDecision(tx, {
      actorId: input.actorId,
      action: 'CONTENT_REPORT_RESOLVED_WARNING',
      reportId: report.id,
      extra: { targetUserId: target.ownerUserId },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

export type AccountWarning = {
  id: string;
  /** ISO timestamp of the audit entry; formatted by the caller. */
  issuedAt: string;
  /** The admin's decision reason, or null when it can not be recovered. */
  reason: string | null;
};

/** How many warnings the account page loads. */
const ACCOUNT_WARNINGS_LIMIT = 5;

/**
 * Read the `reportId` back from a stored audit entry. A malformed or missing
 * value is not an error: the warning still exists, only its reason is unknown.
 */
async function warningReport(details: string | null) {
  if (!details) {
    return null;
  }

  let reportId: unknown;
  try {
    reportId = (JSON.parse(details) as { reportId?: unknown }).reportId;
  } catch {
    return null;
  }

  if (typeof reportId !== 'string' || reportId === '') {
    return null;
  }

  return db.orm.public.ContentReport.first({ id: reportId });
}

/**
 * Warnings for one account, newest first.
 *
 * The caller must pass the id of the authenticated session user; there is no
 * parameter for a different account and no lookup by report or target id. The
 * audit entry belongs to the warned account, so one user can never read
 * another user's warnings through this function.
 *
 * Only the decision reason is exposed. The report text, the reporting user and
 * the deciding admin stay internal.
 */
export async function listAccountWarnings(userId: string): Promise<AccountWarning[]> {
  const entries = await db.orm.public.AuditLog.where({
    userId,
    action: 'USER_WARNED',
  }).all();

  const newest = [...entries]
    .sort((a, b) => (a.createdAt.toString() < b.createdAt.toString() ? 1 : -1))
    .slice(0, ACCOUNT_WARNINGS_LIMIT);

  const warnings: AccountWarning[] = [];
  for (const entry of newest) {
    const report = await warningReport(entry.details);
    const reason = report?.resolutionNotes?.trim() ?? '';

    warnings.push({
      id: entry.id,
      issuedAt: entry.createdAt.toString(),
      reason: reason.length > 0 ? reason : null,
    });
  }

  return warnings;
}

/**
 * Suspend the account behind the reported content.
 *
 * The suspension is its own atomic transaction (`suspendAccount`), the report is
 * closed only after it succeeded. A failure therefore leaves the report open for
 * a retry instead of recording a sanction that never happened.
 */
export async function suspendReportedAccount(input: {
  actorId: string;
  reportId: string;
  notes?: string;
  until?: Temporal.Instant | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const notes = normalizeNotes(input.notes);

  const report = await db.orm.public.ContentReport.first({ id: input.reportId });
  if (!report) {
    throw new NotFoundError('Meldung nicht gefunden.');
  }
  if (report.status !== 'OPEN') {
    throw new BaseConflictError(
      'Diese Meldung wurde bereits entschieden.',
      'REPORT_ALREADY_DECIDED',
    );
  }

  const target = await resolveReportTarget(report.targetType, report.targetId);
  if (!target?.ownerUserId) {
    throw new NotFoundError('Das gemeldete Ziel hat kein zuordenbares Konto.');
  }

  await suspendAccount({
    actorId: input.actorId,
    targetUserId: target.ownerUserId,
    reason: notes,
    until: input.until ?? null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await db.transaction(async (tx) => {
    await resolveActingAdmin(tx, input.actorId);
    await closeReport(tx, {
      reportId: report.id,
      actorId: input.actorId,
      status: 'ACCOUNT_SUSPENDED',
      notes,
    });
    await auditDecision(tx, {
      actorId: input.actorId,
      action: 'CONTENT_REPORT_RESOLVED_ACCOUNT_SUSPENDED',
      reportId: report.id,
      extra: { targetUserId: target.ownerUserId },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}
