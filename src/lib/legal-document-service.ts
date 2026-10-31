/**
 * Central management of versioned legal documents.
 *
 * Each row in `LegalDocument` is one version. Drafts are never public; only the
 * latest published version of a given type is returned to the public pages.
 */
import type * as DbModule from './db';
import type { Role } from './validations';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('./db');
  return mod.db;
}

type Transaction = Parameters<Parameters<typeof DbModule.db['transaction']>[0]>[0];

export type LegalDocumentType = 'IMPRESSUM' | 'DATENSCHUTZ' | 'NUTZUNGSBEDINGUNGEN';
export type LegalDocumentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type LegalDocumentVersion = {
  id: string;
  type: LegalDocumentType;
  versionNumber: number;
  title: string | null;
  content: string;
  changeDescription: string | null;
  status: LegalDocumentStatus;
  requiresConsent: boolean;
  createdBy: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type RequestMeta = { ipAddress?: string | null; userAgent?: string | null };

function toVersion(row: {
  id: string;
  type: LegalDocumentType;
  versionNumber: number;
  title: string | null;
  content: string;
  changeDescription: string | null;
  status: LegalDocumentStatus;
  requiresConsent: boolean;
  createdBy: string | null;
  publishedBy: string | null;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
  publishedAt: Temporal.Instant | null;
}): LegalDocumentVersion {
  return {
    id: row.id,
    type: row.type,
    versionNumber: row.versionNumber,
    title: row.title,
    content: row.content,
    changeDescription: row.changeDescription,
    status: row.status,
    requiresConsent: row.requiresConsent,
    createdBy: row.createdBy,
    publishedBy: row.publishedBy,
    createdAt: row.createdAt.toString(),
    updatedAt: row.updatedAt.toString(),
    publishedAt: row.publishedAt ? row.publishedAt.toString() : null,
  };
}

async function requireAdminActor(tx: Transaction, actorId: string) {
  const auth = await import('./auth-service');
  const actor = await tx.orm.public.User.first({ id: actorId });
  if (!actor) throw new auth.NotFoundError('Benutzerkonto nicht gefunden.');
  if (!auth.hasRole(actor.role as Role, 'ADMIN')) {
    throw new auth.ForbiddenError('Für die Verwaltung rechtlicher Inhalte ist die Administratorrolle erforderlich.');
  }
  return actor;
}

async function writeAudit(
  tx: Transaction,
  actorId: string,
  action: string,
  details: unknown,
  meta?: RequestMeta,
): Promise<void> {
  await tx.orm.public.AuditLog.create({
    userId: actorId,
    action,
    details: details ? JSON.stringify(details) : null,
    ipAddress: meta?.ipAddress ?? null,
    userAgent: meta?.userAgent ?? null,
  });
}

function maxVersion(rows: { versionNumber: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.versionNumber), 0);
}

export async function getPublishedLegalDocument(
  type: LegalDocumentType,
): Promise<LegalDocumentVersion | null> {
  try {
    const rows = await (await getDb()).orm.public.LegalDocument.where({ type, status: 'PUBLISHED' })
      .orderBy((doc) => doc.versionNumber.desc())
      .all();
    const row = rows[0];
    return row ? toVersion(row as never) : null;
  } catch {
    return null;
  }
}

export async function listLegalDocumentVersions(
  type: LegalDocumentType,
): Promise<LegalDocumentVersion[]> {
  const rows = await (await getDb()).orm.public.LegalDocument.where({ type })
    .orderBy((doc) => doc.versionNumber.desc())
    .all();
  return rows.map((row) => toVersion(row as never));
}

export async function getLegalDocumentById(id: string): Promise<LegalDocumentVersion | null> {
  const row = await (await getDb()).orm.public.LegalDocument.first({ id });
  return row ? toVersion(row as never) : null;
}

export async function createLegalDocumentDraft(input: {
  actorId: string;
  type: LegalDocumentType;
  content: string;
  title?: string | null;
  changeDescription?: string | null;
  requiresConsent?: boolean;
  meta?: RequestMeta;
}): Promise<LegalDocumentVersion> {
  return (await getDb()).transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);
    const existing = await tx.orm.public.LegalDocument.where({ type: input.type }).all();
    const versionNumber = maxVersion(existing as { versionNumber: number }[]) + 1;
    const created = await tx.orm.public.LegalDocument.create({
      type: input.type,
      versionNumber,
      title: input.title ?? null,
      content: input.content,
      changeDescription: input.changeDescription ?? null,
      status: 'DRAFT',
      requiresConsent: input.requiresConsent ?? (input.type === 'NUTZUNGSBEDINGUNGEN' ? false : false),
      createdBy: input.actorId,
      publishedBy: null,
      publishedAt: null,
    });
    await writeAudit(tx, input.actorId, 'LEGAL_DOCUMENT_DRAFT_CREATED', {
      documentId: created.id,
      type: input.type,
      versionNumber,
    }, input.meta);
    return toVersion(created as never);
  });
}

export async function updateLegalDocumentDraft(input: {
  actorId: string;
  documentId: string;
  content: string;
  title?: string | null;
  changeDescription?: string | null;
  requiresConsent?: boolean;
  meta?: RequestMeta;
}): Promise<LegalDocumentVersion> {
  return (await getDb()).transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);
    const existing = await tx.orm.public.LegalDocument.first({ id: input.documentId });
    if (!existing) throw new (await import('./auth-service')).NotFoundError('Dokumentversion nicht gefunden.');
    if ((existing as { status: string }).status !== 'DRAFT') {
      throw new (await import('./auth-service')).AuthError('Nur Entwürfe können bearbeitet werden.', 400, 'NOT_DRAFT');
    }
    await tx.orm.public.LegalDocument.where({ id: existing.id }).update({
      title: input.title === undefined ? (existing as { title: string | null }).title : input.title,
      content: input.content,
      changeDescription: input.changeDescription === undefined ? (existing as { changeDescription: string | null }).changeDescription : input.changeDescription,
      requiresConsent: input.requiresConsent === undefined ? (existing as { requiresConsent: boolean }).requiresConsent : input.requiresConsent,
    });
    const updated = await tx.orm.public.LegalDocument.first({ id: existing.id });
    if (!updated) throw new (await import('./auth-service')).NotFoundError('Dokumentversion nicht gefunden.');
    await writeAudit(tx, input.actorId, 'LEGAL_DOCUMENT_DRAFT_UPDATED', {
      documentId: existing.id,
      type: (existing as { type: LegalDocumentType }).type,
    }, input.meta);
    return toVersion(updated as never);
  });
}

export async function publishLegalDocument(input: {
  actorId: string;
  documentId?: string;
  type?: LegalDocumentType;
  content?: string;
  title?: string | null;
  changeDescription?: string | null;
  requiresConsent?: boolean;
  meta?: RequestMeta;
}): Promise<LegalDocumentVersion> {
  return (await getDb()).transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);
    let source: { id: string; type: LegalDocumentType; content: string; title: string | null; changeDescription: string | null; requiresConsent: boolean } | null = null;

    if (input.documentId) {
      const existing = await tx.orm.public.LegalDocument.first({ id: input.documentId });
      if (!existing) throw new (await import('./auth-service')).NotFoundError('Dokumentversion nicht gefunden.');
      const e = existing as unknown as { id: string; type: LegalDocumentType; content: string; title: string | null; changeDescription: string | null; requiresConsent: boolean; status: LegalDocumentStatus };
      source = { id: e.id, type: e.type, content: e.content, title: e.title, changeDescription: e.changeDescription, requiresConsent: e.requiresConsent };
      if (e.status === 'DRAFT') {
        // Mark draft as published in place (counts as a publication/version).
        await tx.orm.public.LegalDocument.where({ id: e.id }).update({
          status: 'PUBLISHED',
          publishedAt: Temporal.Now.instant(),
          publishedBy: input.actorId,
          changeDescription: input.changeDescription === undefined ? e.changeDescription : input.changeDescription,
          requiresConsent: input.requiresConsent === undefined ? e.requiresConsent : input.requiresConsent,
          content: input.content === undefined ? e.content : input.content,
          title: input.title === undefined ? e.title : input.title,
        });
        const updated = await tx.orm.public.LegalDocument.first({ id: e.id });
        if (!updated) throw new (await import('./auth-service')).NotFoundError('Dokumentversion nicht gefunden.');
        const u = updated as unknown as { type: LegalDocumentType; requiresConsent: boolean };
        await writeAudit(tx, input.actorId, 'LEGAL_DOCUMENT_PUBLISHED', {
          documentId: e.id,
          type: e.type,
          versionNumber: (updated as { versionNumber: number }).versionNumber,
          requiresConsent: u.requiresConsent,
        }, input.meta);
        return toVersion(updated as never);
      }
    }

    // Otherwise create a new published version from provided content.
    const type = input.type ?? source?.type;
    if (!type) throw new (await import('./auth-service')).AuthError('Dokumenttyp fehlt.', 400, 'VALIDATION_ERROR');
    const all = await tx.orm.public.LegalDocument.where({ type }).all();
    const versionNumber = maxVersion(all as { versionNumber: number }[]) + 1;
    const created = await tx.orm.public.LegalDocument.create({
      type,
      versionNumber,
      title: input.title ?? source?.title ?? null,
      content: input.content ?? source?.content ?? '',
      changeDescription: input.changeDescription ?? source?.changeDescription ?? null,
      status: 'PUBLISHED',
      requiresConsent: input.requiresConsent ?? source?.requiresConsent ?? (type === 'NUTZUNGSBEDINGUNGEN' ? false : false),
      createdBy: input.actorId,
      publishedBy: input.actorId,
      publishedAt: Temporal.Now.instant(),
    });
    await writeAudit(tx, input.actorId, 'LEGAL_DOCUMENT_PUBLISHED', {
      documentId: created.id,
      type,
      versionNumber,
    }, input.meta);
    return toVersion(created as never);
  });
}

export async function restoreLegalDocumentVersion(input: {
  actorId: string;
  versionId: string;
  meta?: RequestMeta;
}): Promise<LegalDocumentVersion> {
  return (await getDb()).transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);
    const existing = await tx.orm.public.LegalDocument.first({ id: input.versionId });
    if (!existing) throw new (await import('./auth-service')).NotFoundError('Dokumentversion nicht gefunden.');
    const e = existing as unknown as { type: LegalDocumentType; content: string; title: string | null; changeDescription: string | null; requiresConsent: boolean };
    const all = await tx.orm.public.LegalDocument.where({ type: e.type }).all();
    const versionNumber = maxVersion(all as { versionNumber: number }[]) + 1;
    const created = await tx.orm.public.LegalDocument.create({
      type: e.type,
      versionNumber,
      title: e.title,
      content: e.content,
      changeDescription: `Wiederhergestellt aus Version ${ (existing as { versionNumber: number }).versionNumber }`,
      status: 'DRAFT',
      requiresConsent: e.requiresConsent,
      createdBy: input.actorId,
      publishedBy: null,
      publishedAt: null,
    });
    await writeAudit(tx, input.actorId, 'LEGAL_DOCUMENT_VERSION_RESTORED', {
      sourceVersionId: input.versionId,
      newDocumentId: created.id,
      type: e.type,
    }, input.meta);
    return toVersion(created as never);
  });
}

// Consent handling
export async function recordLegalConsent(input: {
  userId: string;
  documentType: LegalDocumentType;
  documentVersionId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await (await getDb()).orm.public.LegalConsent.create({
    userId: input.userId,
    documentType: input.documentType,
    documentVersionId: input.documentVersionId,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
  try {
    await (await getDb()).orm.public.AuditLog.create({
      userId: input.userId,
      action: 'LEGAL_CONSENT_RECORDED',
      details: JSON.stringify({
        documentType: input.documentType,
        documentVersionId: input.documentVersionId,
      }),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch {
    // non-critical
  }
}

export async function getLatestLegalConsent(userId: string, type: LegalDocumentType) {
  const rows = await (await getDb()).orm.public.LegalConsent.where({ userId, documentType: type })
    .orderBy((c) => c.acceptedAt.desc())
    .all();
  return rows[0] ?? null;
}

export async function hasAcceptedLatestTerms(userId: string): Promise<boolean> {
  const published = await getPublishedLegalDocument('NUTZUNGSBEDINGUNGEN');
  if (!published) return true;
  const consent = await getLatestLegalConsent(userId, 'NUTZUNGSBEDINGUNGEN');
  if (!consent) return false;
  return (consent as { documentVersionId: string }).documentVersionId === published.id;
}

// Privacy impact marking
export async function markPrivacyRelevantChange(input: {
  actorId: string;
  area: string;
  description: string;
  meta?: RequestMeta;
}): Promise<void> {
  await (await getDb()).transaction(async (tx) => {
    await requireAdminActor(tx, input.actorId);
    await tx.orm.public.PrivacyImpactNote.create({
      area: input.area,
      description: input.description,
      markedById: input.actorId,
    });
    await writeAudit(tx, input.actorId, 'PRIVACY_RELEVANT_CHANGE_MARKED', {
      area: input.area,
      description: input.description,
    }, input.meta);
  });
}

export async function listPrivacyImpactNotes() {
  return (await getDb()).orm.public.PrivacyImpactNote.orderBy((n) => n.createdAt.desc()).all();
}

// Aliases for compatibility
export const getPublishedDocument = getPublishedLegalDocument;
export const listVersions = listLegalDocumentVersions;
export const saveDraft = createLegalDocumentDraft;
export const updateDraft = updateLegalDocumentDraft;
export const publish = publishLegalDocument;
export const restoreVersion = restoreLegalDocumentVersion;
export const recordConsent = recordLegalConsent;
export const markPrivacyImpact = markPrivacyRelevantChange;