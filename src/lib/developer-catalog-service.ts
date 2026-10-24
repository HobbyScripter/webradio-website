/**
 * Developer-facing catalogue service.
 *
 * Every read and write resolves the caller's DeveloperProfile from the actor's
 * user id and then queries with `developerId` in the WHERE clause. Knowing a
 * plugin/theme id is therefore never enough to read or modify another
 * developer's entry.
 *
 * Status changes follow `catalog-workflow.ts`, and every mutation writes an
 * audit entry inside the same transaction as the data change.
 */
import { db } from './db';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  hasRole,
  logServerError,
} from './auth-service';
import {
  pluginCreateSchema,
  pluginVersionSchema,
  themeCreateSchema,
  type CatalogStatus,
  type PluginCreateInput,
  type PluginVersionInput,
  type Role,
  type ThemeCreateInput,
} from './validations';
import {
  CATALOG_KIND_LABELS,
  canSubmitForReview,
  decisionRequiresNotes,
  editOutcome,
  isValidModerationNotes,
  versionOutcome,
  type CatalogKind,
  type ModerationDecision,
} from './catalog-workflow';

export class ConflictError extends AuthError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, 409, code);
    this.name = 'ConflictError';
  }
}

export type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type OwnedEntry = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: CatalogStatus;
  isPublished: boolean;
  downloads: number;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
};

async function requireDeveloperProfile(
  actorId: string,
  tx: Transaction | typeof db = db,
) {
  const actor = await tx.orm.public.User.first({ id: actorId });
  if (!actor) {
    throw new NotFoundError('Benutzerkonto nicht gefunden.');
  }
  if (!hasRole(actor.role as Role, 'DEVELOPER')) {
    throw new ForbiddenError('Für diese Aktion ist die Entwicklerrolle erforderlich.');
  }

  const profile = await tx.orm.public.DeveloperProfile.where({ userId: actorId }).first();
  if (!profile) {
    throw new NotFoundError(
      'Es existiert noch kein Entwicklerprofil. Bitte erstelle zuerst ein Profil.',
    );
  }
  return profile;
}

async function loadOwnedEntry(
  kind: CatalogKind,
  entryId: string,
  developerId: string,
  tx: Transaction | typeof db = db,
): Promise<OwnedEntry> {
  if (kind === 'PLUGIN') {
    const plugin = await tx.orm.public.Plugin.where({ id: entryId, developerId }).first();
    if (!plugin) {
      throw new NotFoundError('Plugin nicht gefunden oder kein Zugriff.');
    }
    return plugin;
  }

  const theme = await tx.orm.public.Theme.where({ id: entryId, developerId }).first();
  if (!theme) {
    throw new NotFoundError('Theme nicht gefunden oder kein Zugriff.');
  }
  return theme;
}

async function writeAudit(
  tx: Transaction,
  input: {
    actorId: string;
    action: string;
    details?: unknown;
    meta?: RequestMeta;
  },
): Promise<void> {
  await tx.orm.public.AuditLog.create({
    userId: input.actorId,
    action: input.action,
    details: input.details ? JSON.stringify(input.details) : null,
    ipAddress: input.meta?.ipAddress ?? null,
    userAgent: input.meta?.userAgent ?? null,
  });
}

async function assertSlugAvailable(
  kind: CatalogKind,
  slug: string,
  excludeId?: string,
  tx: Transaction | typeof db = db,
): Promise<void> {
  if (kind === 'PLUGIN') {
    const existing = await tx.orm.public.Plugin.first({ slug });
    if (existing && existing.id !== excludeId) {
      throw new ConflictError('Dieser Plugin-Slug ist bereits vergeben.', 'SLUG_EXISTS');
    }
    return;
  }

  const existing = await tx.orm.public.Theme.first({ slug });
  if (existing && existing.id !== excludeId) {
    throw new ConflictError('Dieser Theme-Slug ist bereits vergeben.', 'SLUG_EXISTS');
  }
}

async function countVersions(
  kind: CatalogKind,
  entryId: string,
  tx: Transaction | typeof db = db,
): Promise<number> {
  const rows =
    kind === 'PLUGIN'
      ? await tx.orm.public.PluginVersion.where({ pluginId: entryId }).all()
      : await tx.orm.public.ThemeVersion.where({ themeId: entryId }).all();
  return rows.length;
}

/** Validate raw input server-side; callers never pass their own parsed shape. */
function parseCreateInput(
  kind: CatalogKind,
  raw: unknown,
): PluginCreateInput | ThemeCreateInput {
  const parsed =
    kind === 'PLUGIN' ? pluginCreateSchema.safeParse(raw) : themeCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AuthError(
      parsed.error.issues.map((issue) => issue.message).join(' '),
      400,
      'VALIDATION_ERROR',
    );
  }
  return parsed.data;
}

export type CatalogEntryResult = {
  id: string;
  slug: string;
  status: string;
  isPublished: boolean;
  requiresReReview: boolean;
};

export async function createCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  raw: unknown;
  meta?: RequestMeta;
}): Promise<CatalogEntryResult> {
  const data = parseCreateInput(input.kind, input.raw);

  return db.transaction(async (tx) => {
    const profile = await requireDeveloperProfile(input.actorId, tx);
    await assertSlugAvailable(input.kind, data.slug, undefined, tx);

    const status = data.saveAsDraft ? 'DRAFT' : 'PENDING_REVIEW';

    if (input.kind === 'PLUGIN') {
      const created = await tx.orm.public.Plugin.create({
        slug: data.slug,
        name: data.name,
        description: data.description,
        product: 'WEBRADIO',
        developerId: profile.id,
        status,
        isPublished: false,
        downloads: 0,
      });

      await writeAudit(tx, {
        actorId: input.actorId,
        action: 'PLUGIN_CREATED',
        details: { pluginId: created.id, slug: created.slug, status },
        meta: input.meta,
      });

      return {
        id: created.id,
        slug: created.slug,
        status: created.status,
        isPublished: created.isPublished,
        requiresReReview: false,
      };
    }

    const created = await tx.orm.public.Theme.create({
      slug: data.slug,
      name: data.name,
      description: data.description,
      product: 'WEBRADIO',
      developerId: profile.id,
      status,
      isPublished: false,
      downloads: 0,
    });

    await writeAudit(tx, {
      actorId: input.actorId,
      action: 'THEME_CREATED',
      details: { themeId: created.id, slug: created.slug, status },
      meta: input.meta,
    });

    return {
      id: created.id,
      slug: created.slug,
      status: created.status,
      isPublished: created.isPublished,
      requiresReReview: false,
    };
  });
}

export async function updateCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  raw: unknown;
  meta?: RequestMeta;
}): Promise<CatalogEntryResult> {
  const data = parseCreateInput(input.kind, input.raw);

  return db.transaction(async (tx) => {
    const profile = await requireDeveloperProfile(input.actorId, tx);
    const entry = await loadOwnedEntry(input.kind, input.entryId, profile.id, tx);

    await assertSlugAvailable(input.kind, data.slug, entry.id, tx);

    const outcome = editOutcome({
      status: entry.status,
      isPublished: entry.isPublished,
    });

    const changes: Record<string, unknown> = {};
    if (entry.slug !== data.slug) changes.slug = { from: entry.slug, to: data.slug };
    if (entry.name !== data.name) changes.name = { from: entry.name, to: data.name };
    if (entry.description !== data.description) {
      changes.description = { from: entry.description, to: data.description };
    }

    if (input.kind === 'PLUGIN') {
      await tx.orm.public.Plugin.where({ id: entry.id }).update({
        slug: data.slug,
        name: data.name,
        description: data.description,
        product: 'WEBRADIO',
        status: outcome.status,
        isPublished: outcome.isPublished,
      });
    } else {
      await tx.orm.public.Theme.where({ id: entry.id }).update({
        slug: data.slug,
        name: data.name,
        description: data.description,
        product: 'WEBRADIO',
        status: outcome.status,
        isPublished: outcome.isPublished,
      });
    }

    if (Object.keys(changes).length > 0 || outcome.requiresReReview) {
      await writeAudit(tx, {
        actorId: input.actorId,
        action:
          input.kind === 'PLUGIN'
            ? outcome.requiresReReview
              ? 'PLUGIN_RESUBMITTED_FOR_REVIEW'
              : 'PLUGIN_UPDATED'
            : outcome.requiresReReview
              ? 'THEME_RESUBMITTED_FOR_REVIEW'
              : 'THEME_UPDATED',
        details: {
          entryId: entry.id,
          changes,
          statusBefore: entry.status,
          statusAfter: outcome.status,
          publishedBefore: entry.isPublished,
          publishedAfter: outcome.isPublished,
        },
        meta: input.meta,
      });
    }

    return {
      id: entry.id,
      slug: data.slug,
      status: outcome.status,
      isPublished: outcome.isPublished,
      requiresReReview: outcome.requiresReReview,
    };
  });
}

export async function deleteCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  meta?: RequestMeta;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const profile = await requireDeveloperProfile(input.actorId, tx);
    const entry = await loadOwnedEntry(input.kind, input.entryId, profile.id, tx);

    if (input.kind === 'PLUGIN') {
      await tx.orm.public.Plugin.where({ id: entry.id }).delete();
    } else {
      await tx.orm.public.Theme.where({ id: entry.id }).delete();
    }

    await writeAudit(tx, {
      actorId: input.actorId,
      action: input.kind === 'PLUGIN' ? 'PLUGIN_DELETED' : 'THEME_DELETED',
      details: {
        entryId: entry.id,
        slug: entry.slug,
        name: entry.name,
        status: entry.status,
      },
      meta: input.meta,
    });
  });
}

export async function submitCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  meta?: RequestMeta;
}): Promise<CatalogEntryResult> {
  return db.transaction(async (tx) => {
    const profile = await requireDeveloperProfile(input.actorId, tx);
    const entry = await loadOwnedEntry(input.kind, input.entryId, profile.id, tx);

    if (!canSubmitForReview(entry.status)) {
      throw new ConflictError(
        `${CATALOG_KIND_LABELS[input.kind]}: Nur Entwürfe, abgelehnte oder zurückgezogene Einträge können eingereicht werden.`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    if ((await countVersions(input.kind, entry.id, tx)) === 0) {
      throw new ConflictError(
        'Vor der Einreichung muss mindestens eine Version hinterlegt sein.',
        'VERSION_REQUIRED',
      );
    }

    if (input.kind === 'PLUGIN') {
      await tx.orm.public.Plugin.where({ id: entry.id }).update({
        status: 'PENDING_REVIEW',
        isPublished: false,
      });
    } else {
      await tx.orm.public.Theme.where({ id: entry.id }).update({
        status: 'PENDING_REVIEW',
        isPublished: false,
      });
    }

    await writeAudit(tx, {
      actorId: input.actorId,
      action: input.kind === 'PLUGIN' ? 'PLUGIN_SUBMITTED' : 'THEME_SUBMITTED',
      details: { entryId: entry.id, statusBefore: entry.status, statusAfter: 'PENDING_REVIEW' },
      meta: input.meta,
    });

    return {
      id: entry.id,
      slug: entry.slug,
      status: 'PENDING_REVIEW',
      isPublished: false,
      requiresReReview: false,
    };
  });
}

/** Withdraw a submission so the developer can keep editing without review. */
export async function withdrawCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  meta?: RequestMeta;
}): Promise<CatalogEntryResult> {
  return db.transaction(async (tx) => {
    const profile = await requireDeveloperProfile(input.actorId, tx);
    const entry = await loadOwnedEntry(input.kind, input.entryId, profile.id, tx);

    if (entry.status !== 'PENDING_REVIEW') {
      throw new ConflictError(
        'Nur eine laufende Einreichung kann zurückgezogen werden.',
        'INVALID_STATUS_TRANSITION',
      );
    }

    if (input.kind === 'PLUGIN') {
      await tx.orm.public.Plugin.where({ id: entry.id }).update({
        status: 'DRAFT',
        isPublished: false,
      });
    } else {
      await tx.orm.public.Theme.where({ id: entry.id }).update({
        status: 'DRAFT',
        isPublished: false,
      });
    }

    await writeAudit(tx, {
      actorId: input.actorId,
      action: input.kind === 'PLUGIN' ? 'PLUGIN_WITHDRAWN' : 'THEME_WITHDRAWN',
      details: { entryId: entry.id, statusBefore: entry.status, statusAfter: 'DRAFT' },
      meta: input.meta,
    });

    return {
      id: entry.id,
      slug: entry.slug,
      status: 'DRAFT',
      isPublished: false,
      requiresReReview: false,
    };
  });
}

export async function addCatalogVersion(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  raw: unknown;
  meta?: RequestMeta;
}): Promise<{ id: string; version: string; requiresReReview: boolean }> {
  const parsed = pluginVersionSchema.safeParse(input.raw);
  if (!parsed.success) {
    throw new AuthError(
      parsed.error.issues.map((issue) => issue.message).join(' '),
      400,
      'VALIDATION_ERROR',
    );
  }
  const data: PluginVersionInput = parsed.data;

  return db.transaction(async (tx) => {
    const profile = await requireDeveloperProfile(input.actorId, tx);
    const entry = await loadOwnedEntry(input.kind, input.entryId, profile.id, tx);

    const outcome = versionOutcome({ status: entry.status, isPublished: entry.isPublished });
    if (outcome.blocked) {
      throw new ConflictError(
        'Während einer laufenden Prüfung können keine Versionen hinzugefügt werden. Ziehe die Einreichung zuerst zurück.',
        'REVIEW_IN_PROGRESS',
      );
    }

    const duplicate =
      input.kind === 'PLUGIN'
        ? await tx.orm.public.PluginVersion.first({
            pluginId: entry.id,
            version: data.version,
          })
        : await tx.orm.public.ThemeVersion.first({ themeId: entry.id, version: data.version });

    if (duplicate) {
      throw new ConflictError('Diese Version existiert bereits.', 'VERSION_EXISTS');
    }

    // Only one row is `isLatest`; clear the previous flag explicitly.
    const previousLatest =
      input.kind === 'PLUGIN'
        ? await tx.orm.public.PluginVersion.where({ pluginId: entry.id, isLatest: true }).all()
        : await tx.orm.public.ThemeVersion.where({ themeId: entry.id, isLatest: true }).all();

    for (const row of previousLatest) {
      if (input.kind === 'PLUGIN') {
        await tx.orm.public.PluginVersion.where({ id: row.id }).update({ isLatest: false });
      } else {
        await tx.orm.public.ThemeVersion.where({ id: row.id }).update({ isLatest: false });
      }
    }

    let createdId = '';
    if (input.kind === 'PLUGIN') {
      const created = await tx.orm.public.PluginVersion.create({
        pluginId: entry.id,
        version: data.version,
        description: data.description ?? null,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        checksum: data.checksum,
        minWebradioVersion: data.minWebradioVersion ?? null,
        maxWebradioVersion: data.maxWebradioVersion ?? null,
        isLatest: true,
      });
      createdId = created.id;
    } else {
      const created = await tx.orm.public.ThemeVersion.create({
        themeId: entry.id,
        version: data.version,
        description: data.description ?? null,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        checksum: data.checksum,
        minWebradioVersion: data.minWebradioVersion ?? null,
        maxWebradioVersion: data.maxWebradioVersion ?? null,
        isLatest: true,
      });
      createdId = created.id;
    }

    if (outcome.requiresReReview) {
      if (input.kind === 'PLUGIN') {
        await tx.orm.public.Plugin.where({ id: entry.id }).update({
          status: outcome.status,
          isPublished: outcome.isPublished,
        });
      } else {
        await tx.orm.public.Theme.where({ id: entry.id }).update({
          status: outcome.status,
          isPublished: outcome.isPublished,
        });
      }
    }

    await writeAudit(tx, {
      actorId: input.actorId,
      action:
        input.kind === 'PLUGIN' ? 'PLUGIN_VERSION_CREATED' : 'THEME_VERSION_CREATED',
      details: {
        entryId: entry.id,
        versionId: createdId,
        version: data.version,
        statusAfter: outcome.status,
        requiresReReview: outcome.requiresReReview,
      },
      meta: input.meta,
    });

    return {
      id: createdId,
      version: data.version,
      requiresReReview: outcome.requiresReReview,
    };
  });
}

export type OwnedEntryDetail = {
  entry: {
    id: string;
    slug: string;
    name: string;
    description: string;
    status: string;
    isPublished: boolean;
    downloads: number;
    createdAt: string;
    updatedAt: string;
  };
  versions: {
    id: string;
    version: string;
    description: string | null;
    fileUrl: string;
    fileSize: number;
    checksum: string;
    releasedAt: string;
    isLatest: boolean;
  }[];
  screenshots: { id: string; url: string; caption: string | null; order: number }[];
  tags: string[];
  reviews: ModerationFeedback[];
};

/** List the caller's own entries. The developerId filter is mandatory. */
export async function listOwnedEntries(
  actorId: string,
  kind: CatalogKind,
): Promise<OwnedEntryDetail[]> {
  const profile = await requireDeveloperProfile(actorId);

  const entries =
    kind === 'PLUGIN'
      ? await db.orm.public.Plugin.where({ developerId: profile.id }).all()
      : await db.orm.public.Theme.where({ developerId: profile.id }).all();

  return Promise.all(
    entries.map((entry) => buildOwnedEntryDetail(actorId, kind, entry.id)),
  );
}

/** Read one entry; a foreign or unknown id returns the same 404. */
export async function getOwnedEntry(
  actorId: string,
  kind: CatalogKind,
  entryId: string,
): Promise<OwnedEntryDetail> {
  return buildOwnedEntryDetail(actorId, kind, entryId);
}

async function buildOwnedEntryDetail(
  actorId: string,
  kind: CatalogKind,
  entryId: string,
): Promise<OwnedEntryDetail> {
  const profile = await requireDeveloperProfile(actorId);
  const entry = await loadOwnedEntry(kind, entryId, profile.id);

  const [versions, screenshots, tags, reviews] =
    kind === 'PLUGIN'
      ? await Promise.all([
          db.orm.public.PluginVersion.where({ pluginId: entry.id })
            .orderBy((version) => version.releasedAt.desc())
            .all(),
          db.orm.public.PluginScreenshot.where({ pluginId: entry.id })
            .orderBy((screenshot) => screenshot.order.asc())
            .all(),
          db.orm.public.PluginTag.where({ pluginId: entry.id }).all(),
          db.orm.public.PublicationReview.where({ targetType: 'PLUGIN', targetId: entry.id })
            .orderBy((review) => review.createdAt.desc())
            .all(),
        ])
      : await Promise.all([
          db.orm.public.ThemeVersion.where({ themeId: entry.id })
            .orderBy((version) => version.releasedAt.desc())
            .all(),
          db.orm.public.ThemeScreenshot.where({ themeId: entry.id })
            .orderBy((screenshot) => screenshot.order.asc())
            .all(),
          db.orm.public.ThemeTag.where({ themeId: entry.id }).all(),
          db.orm.public.PublicationReview.where({ targetType: 'THEME', targetId: entry.id })
            .orderBy((review) => review.createdAt.desc())
            .all(),
        ]);

  return {
    entry: {
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      status: entry.status,
      isPublished: entry.isPublished,
      downloads: entry.downloads,
      createdAt: entry.createdAt.toString(),
      updatedAt: entry.updatedAt.toString(),
    },
    versions: versions.map((version) => ({
      id: version.id,
      version: version.version,
      description: version.description,
      fileUrl: version.fileUrl,
      fileSize: version.fileSize,
      checksum: version.checksum,
      releasedAt: version.releasedAt.toString(),
      isLatest: version.isLatest,
    })),
    screenshots: screenshots.map((screenshot) => ({
      id: screenshot.id,
      url: screenshot.url,
      caption: screenshot.caption,
      order: screenshot.order,
    })),
    tags: tags.map((tag) => tag.tag),
    reviews: reviews.map((review) => ({
      id: review.id,
      status: review.status,
      notes: review.notes,
      createdAt: review.createdAt.toString(),
    })),
  };
}

export type ModerationFeedback = {
  id: string;
  status: string;
  notes: string | null;
  createdAt: string;
};

/**
 * Reviews for one of the developer's own entries. The ownership check happens
 * before any review row is read.
 */
export async function listOwnedReviews(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
}): Promise<ModerationFeedback[]> {
  const profile = await requireDeveloperProfile(input.actorId);
  const entry = await loadOwnedEntry(input.kind, input.entryId, profile.id);

  const reviews = await db.orm.public.PublicationReview.where({
    targetType: input.kind,
    targetId: entry.id,
  })
    .orderBy((review) => review.createdAt.desc())
    .all();

  return reviews.map((review) => ({
    id: review.id,
    status: review.status,
    notes: review.notes,
    createdAt: review.createdAt.toString(),
  }));
}

export type AdminDecisionResult = {
  id: string;
  status: string;
  isPublished: boolean;
};

/**
 * Admin decision on a pending submission.
 *
 * Authorization is re-resolved from PostgreSQL inside the transaction, the
 * target row is locked, and the current status must still be PENDING_REVIEW.
 * That rejects stale or duplicated decisions instead of overwriting a newer
 * result.
 */
export async function decideCatalogEntry(input: {
  actorId: string;
  kind: CatalogKind;
  entryId: string;
  decision: ModerationDecision;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AdminDecisionResult> {
  if (decisionRequiresNotes(input.decision) && !isValidModerationNotes(input.decision, input.notes)) {
    throw new AuthError(
      `Für diese Entscheidung ist eine Begründung mit mindestens 10 Zeichen erforderlich.`,
      400,
      'NOTES_REQUIRED',
    );
  }

  return db.transaction(async (tx) => {
    const actor = await tx.orm.public.User.first({ id: input.actorId });
    if (!actor) {
      throw new NotFoundError('Benutzerkonto nicht gefunden.');
    }
    if (!hasRole(actor.role as Role, 'ADMIN')) {
      throw new ForbiddenError('Für Moderationsentscheidungen ist die Administratorrolle erforderlich.');
    }

    // Lock the row so two moderators cannot decide the same submission twice.
    const lockedRows =
      input.kind === 'PLUGIN'
        ? await tx.orm.public.Plugin.where({ id: input.entryId }).forNoKeyUpdate().all()
        : await tx.orm.public.Theme.where({ id: input.entryId }).forNoKeyUpdate().all();

    const entry = lockedRows[0];
    if (!entry) {
      throw new NotFoundError('Einreichung nicht gefunden.');
    }

    if (entry.status !== 'PENDING_REVIEW') {
      throw new ConflictError(
        'Diese Einreichung wurde bereits bearbeitet oder ist nicht mehr in Prüfung.',
        'STALE_SUBMISSION',
      );
    }

    const outcome =
      input.decision === 'APPROVED'
        ? { status: 'APPROVED' as const, isPublished: true }
        : input.decision === 'REJECTED'
          ? { status: 'REJECTED' as const, isPublished: false }
          : { status: 'CHANGES_REQUESTED' as const, isPublished: false };

    if (input.kind === 'PLUGIN') {
      await tx.orm.public.Plugin.where({ id: entry.id }).update({
        status: outcome.status,
        isPublished: outcome.isPublished,
      });
    } else {
      await tx.orm.public.Theme.where({ id: entry.id }).update({
        status: outcome.status,
        isPublished: outcome.isPublished,
      });
    }

    await tx.orm.public.PublicationReview.create({
      targetType: input.kind,
      targetId: entry.id,
      reviewerId: input.actorId,
      status: input.decision,
      notes: input.notes?.trim() || null,
    });

    await writeAudit(tx, {
      actorId: input.actorId,
      action:
        input.decision === 'APPROVED'
          ? 'PUBLICATION_APPROVED'
          : input.decision === 'REJECTED'
            ? 'PUBLICATION_REJECTED'
            : 'PUBLICATION_CHANGES_REQUESTED',
      details: {
        targetType: input.kind,
        targetId: entry.id,
        decision: input.decision,
        statusBefore: 'PENDING_REVIEW',
        statusAfter: outcome.status,
        isPublished: outcome.isPublished,
      },
      meta: { ipAddress: input.ipAddress, userAgent: input.userAgent },
    });

    return { id: entry.id, status: outcome.status, isPublished: outcome.isPublished };
  });
}

/**
 * Diagnostics helper used by route handlers to keep unexpected driver errors
 * out of the response body.
 */
export function logCatalogError(scope: string, error: unknown): void {
  logServerError(scope, error);
}
