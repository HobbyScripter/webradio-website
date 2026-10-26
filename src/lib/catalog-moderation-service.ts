/**
 * Administrative catalogue takedown.
 *
 * A takedown is not a review decision: it acts on already published content.
 * It therefore moves the entry to the terminal `REMOVED` state, which
 *
 *   - is invisible in every public query (`APPROVED` + `isPublished` is
 *     required there),
 *   - can not be resubmitted (`canSubmitForReview()` excludes it),
 *   - can not be edited or extended by the owner (`ENTRY_REMOVED`).
 *
 * It is recorded in `PublicationReview` (so the moderation history stays in one
 * table) *and* in the audit log (so the acting administrator is attributable).
 *
 * Known limitation: releases are stored as external URLs (`fileUrl`), and this
 * application is not a download proxy. A takedown removes every link the site
 * renders, but it can not revoke a URL someone already knows.
 */
import { db } from './db';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
} from './auth-service';
import { ConflictError } from './developer-catalog-service';
import { hasRole } from './roles';
import type { Role } from './validations';
import type { CatalogKind } from './catalog-workflow';

export const TAKEDOWN_NOTES_MIN_LENGTH = 10;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function normalizeNotes(notes: string | undefined): string {
  const trimmed = notes?.trim() ?? '';
  if (trimmed.length < TAKEDOWN_NOTES_MIN_LENGTH) {
    throw new AuthError(
      `Eine Entfernung erfordert eine Begründung mit mindestens ${TAKEDOWN_NOTES_MIN_LENGTH} Zeichen.`,
      400,
      'NOTES_REQUIRED',
    );
  }
  return trimmed;
}

async function lockEntry(tx: Transaction, kind: CatalogKind, entryId: string) {
  const rows =
    kind === 'PLUGIN'
      ? await tx.orm.public.Plugin.where({ id: entryId }).forNoKeyUpdate().all()
      : await tx.orm.public.Theme.where({ id: entryId }).forNoKeyUpdate().all();
  return rows[0] ?? null;
}

/**
 * Mark an entry as removed, inside the caller's transaction.
 * Shared by the standalone takedown and the report resolution path.
 */
export async function applyTakedownInTransaction(
  tx: Transaction,
  input: {
    actorId: string;
    kind: CatalogKind;
    entryId: string;
    notes?: string;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<{ id: string; statusBefore: string }> {
  const notes = normalizeNotes(input.notes);

  const entry = await lockEntry(tx, input.kind, input.entryId);
  if (!entry) {
    throw new NotFoundError('Eintrag nicht gefunden.');
  }

  if (entry.status === 'REMOVED') {
    throw new ConflictError(
      'Dieser Eintrag wurde bereits entfernt.',
      'ALREADY_REMOVED',
    );
  }

  if (input.kind === 'PLUGIN') {
    await tx.orm.public.Plugin.where({ id: entry.id }).update({
      status: 'REMOVED',
      isPublished: false,
    });
  } else {
    await tx.orm.public.Theme.where({ id: entry.id }).update({
      status: 'REMOVED',
      isPublished: false,
    });
  }

  await tx.orm.public.PublicationReview.create({
    targetType: input.kind,
    targetId: entry.id,
    reviewerId: input.actorId,
    status: 'REMOVED',
    notes,
  });

  await tx.orm.public.AuditLog.create({
    userId: input.actorId,
    action: 'CATALOG_ENTRY_REMOVED',
    details: JSON.stringify({
      targetType: input.kind,
      targetId: entry.id,
      statusBefore: entry.status,
      statusAfter: 'REMOVED',
    }),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  return { id: entry.id, statusBefore: entry.status };
}

/** Standalone takedown (used by the admin moderation detail page). */
export async function removeCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ id: string; statusBefore: string }> {
  return db.transaction(async (tx) => {
    const actor = await tx.orm.public.User.first({ id: input.actorId });
    if (!actor) {
      throw new NotFoundError('Benutzerkonto nicht gefunden.');
    }
    if (!hasRole(actor.role as Role, 'ADMIN')) {
      throw new ForbiddenError(
        'Für das Entfernen von Inhalten ist die Administratorrolle erforderlich.',
      );
    }

    return applyTakedownInTransaction(tx, input);
  });
}
