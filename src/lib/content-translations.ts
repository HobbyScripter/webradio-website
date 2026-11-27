/**
 * Translations of stored content.
 *
 * Design decisions, and why:
 *
 * - **Normalised, not column-per-language.** One `ContentTranslation` row per
 *   (entity, locale, field) means adding a language never changes the schema.
 * - **The original is never touched.** A translation is an additional row; the
 *   German value stays in the entity's own column. Nothing is overwritten and
 *   deleting a translation restores the source value instantly.
 * - **Publication is gated.** Only `APPROVED` rows are returned to public
 *   readers, and only while they are current (`outdated = false`). A machine
 *   translation, a draft or a stale copy can therefore never leak.
 * - **Staleness is provable.** Every row stores the SHA-256 of the German text it
 *   was produced from. If the source changes, the hash no longer matches, so the
 *   row is treated as outdated even before the nightly job marks it.
 * - **Fallback is explicit.** A missing or unapproved translation returns the
 *   source value, which the caller supplies — never an empty string.
 *
 * All reads use bound parameters through the Prisma 8 client; no locale or field
 * name from a request is ever concatenated into SQL.
 */
import { db } from '@/lib/db';
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@/i18n/config';
import { hashSourceText } from '@/lib/translation/jobs';
import { recordTranslationEvent } from '@/lib/translation/history';

/**
 * Lifecycle of one translation.
 *
 * `MISSING` means "this field has no value for this locale yet". `APPROVED` is
 * the only status the public site serves, and it is only ever set by an
 * administrator — machine output never becomes approved on its own.
 */
export const TRANSLATION_STATUSES = [
  'MISSING',
  'MACHINE_TRANSLATED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED',
] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export function isTranslationStatus(value: unknown): value is TranslationStatus {
  return typeof value === 'string' && (TRANSLATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Statuses an administrator may set by hand. `MISSING` is a computed state, not
 * something a form should be able to write.
 */
export const SETTABLE_STATUSES = ['REVIEW_REQUIRED', 'APPROVED', 'REJECTED'] as const;

/**
 * Which fields of which entity may be translated.
 *
 * An allowlist on purpose: the admin UI, the engine and the API can only write
 * fields that are meant to be public copy. Identifiers, URLs, e-mail addresses,
 * internal notes and status columns are not translatable. The names must match
 * the contract exactly — `source.ts` reads the same columns.
 */
export const TRANSLATABLE_FIELDS: Record<string, readonly string[]> = {
  Plugin: ['name', 'description'],
  Theme: ['name', 'description'],
  Partner: ['description'],
  Advertiser: ['description'],
  AdCampaign: ['name', 'description'],
  News: ['title', 'summary', 'content'],
  RoadmapItem: ['title', 'description'],
  LegalDocument: ['title', 'content'],
};

export function isTranslatableField(entityType: string, field: string): boolean {
  return TRANSLATABLE_FIELDS[entityType]?.includes(field) ?? false;
}

export type TranslationRow = {
  id: string;
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  value: string;
  status: string;
  provider: string | null;
  sourceHash: string | null;
  outdated: boolean;
  reviewedAt: string | null;
};

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/** Approved, current translations for one entity, keyed by field. */
export async function getApprovedTranslations(
  entityType: string,
  entityId: string,
  locale: Locale,
): Promise<Record<string, string>> {
  if (locale === 'de') {
    return {};
  }

  const rows = await db.orm.public.ContentTranslation.where({
    entityType,
    entityId,
    locale,
    status: 'APPROVED',
  })
    .select('field', 'value', 'sourceHash', 'outdated')
    .all();

  const result: Record<string, string> = {};
  for (const row of rows) {
    const value = row as Record<string, unknown>;
    if (value.outdated === true) continue;
    if (typeof value.field === 'string' && typeof value.value === 'string' && value.value.trim() !== '') {
      result[value.field] = value.value;
    }
  }
  return result;
}

type ApprovedRow = {
  field: string;
  value: string;
  sourceHash: string | null;
  outdated: boolean;
};

/** Group raw rows by entity, dropping everything that is not servable. */
function groupApprovedRows(rows: unknown[]): Map<string, ApprovedRow[]> {
  const grouped = new Map<string, ApprovedRow[]>();
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    if (typeof row.entityId !== 'string' || typeof row.field !== 'string') continue;
    if (row.outdated === true) continue;
    const text = typeof row.value === 'string' ? row.value : '';
    if (text.trim() === '') continue;

    const entry: ApprovedRow = {
      field: row.field,
      value: text,
      sourceHash: typeof row.sourceHash === 'string' ? row.sourceHash : null,
      outdated: row.outdated === true,
    };
    const existing = grouped.get(row.entityId);
    if (existing) existing.push(entry);
    else grouped.set(row.entityId, [entry]);
  }
  return grouped;
}

/**
 * Apply approved rows over one record.
 *
 * Four guards keep the wrong text off the site: the field must be on the
 * translation allowlist *and* present on the record (so internal notes or
 * contact columns can never be introduced by a stray row), the row must not be
 * outdated, and — when it carries a source hash — the hash must still match the
 * German value the caller passed in. Everything else keeps the source value.
 */
function applyApprovedRows<T extends object>(
  source: T,
  entityType: string,
  rows: readonly ApprovedRow[],
): T {
  if (rows.length === 0) return source;

  const localized = { ...(source as Record<string, unknown>) };
  let changed = false;

  for (const row of rows) {
    if (!isTranslatableField(entityType, row.field)) continue;
    if (!(row.field in localized)) continue;

    const currentSource = localized[row.field];
    if (row.sourceHash !== null && typeof currentSource === 'string') {
      if (hashSourceText(currentSource) !== row.sourceHash) continue;
    }

    localized[row.field] = row.value;
    changed = true;
  }

  return changed ? (localized as T) : source;
}

/**
 * Localize a list of public DTOs with exactly one database query.
 *
 * This is the entry point the public data layer uses: one read for every
 * approved row of an entity type and locale, then in-memory application. A page
 * with fifty cards therefore costs one extra query, not fifty.
 */
export async function localizeRecords<T extends object>(
  entityType: string,
  locale: Locale,
  records: readonly T[],
): Promise<T[]> {
  if (locale === DEFAULT_LOCALE || records.length === 0) {
    return [...records];
  }

  let rows: unknown[] = [];
  try {
    rows = await db.orm.public.ContentTranslation.where({
      entityType,
      locale,
      status: 'APPROVED',
    })
      .select('entityId', 'field', 'value', 'sourceHash', 'outdated')
      .all();
  } catch {
    // Translation table missing (migration not applied) — serve the source.
    return [...records];
  }

  if (rows.length === 0) return [...records];

  const grouped = groupApprovedRows(rows);
  return records.map((record) => {
    const id = (record as { id?: unknown }).id;
    if (typeof id !== 'string') return record;
    return applyApprovedRows(record, entityType, grouped.get(id) ?? []);
  });
}

/**
 * Apply approved translations over a single source record.
 *
 * Same rules as `localizeRecords`; kept for detail pages and for callers that
 * already hold one record.
 */
export async function localizeRecord<T extends Record<string, unknown>>(
  entityType: string,
  entityId: string,
  locale: Locale,
  source: T,
): Promise<T> {
  if (locale === DEFAULT_LOCALE) {
    return source;
  }

  const [localized] = await localizeRecords(entityType, locale, [
    { ...source, id: entityId } as T & { id: string },
  ]);
  return localized;
}

/** All rows for the admin overview, newest state first. */
export async function listTranslations(
  filter: { locale?: Locale; status?: TranslationStatus; entityType?: string; outdatedOnly?: boolean } = {},
): Promise<TranslationRow[]> {
  const rows = await db.orm.public.ContentTranslation.where(
    filter.locale || filter.status || filter.entityType
      ? {
          ...(filter.locale ? { locale: filter.locale } : {}),
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.entityType ? { entityType: filter.entityType } : {}),
        }
      : {},
  )
    .select(
      'id',
      'entityType',
      'entityId',
      'locale',
      'field',
      'value',
      'status',
      'provider',
      'sourceHash',
      'outdated',
      'reviewedAt',
    )
    .all();

  return (rows as unknown as Array<Record<string, unknown>>)
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      id: String(row.id),
      entityType: String(row.entityType ?? ''),
      entityId: String(row.entityId ?? ''),
      locale: String(row.locale ?? ''),
      field: String(row.field ?? ''),
      value: typeof row.value === 'string' ? row.value : '',
      status: String(row.status ?? 'MISSING'),
      provider: typeof row.provider === 'string' ? row.provider : null,
      sourceHash: typeof row.sourceHash === 'string' ? row.sourceHash : null,
      outdated: row.outdated === true,
      reviewedAt: asIso(row.reviewedAt),
    }))
    .filter((row) => (filter.outdatedOnly ? row.outdated : true))
    .sort((a, b) =>
      (a.entityType + a.entityId + a.field + a.locale).localeCompare(
        b.entityType + b.entityId + b.field + b.locale,
      ),
    );
}

/** Number of stored translations per locale. */
export async function translationCountsByLocale(): Promise<Record<Locale, number>> {
  const counts = Object.fromEntries(LOCALES.map((locale) => [locale, 0])) as Record<Locale, number>;

  const rows = await db.orm.public.ContentTranslation.where({})
    .select('locale')
    .all();

  for (const row of rows) {
    const locale = (row as Record<string, unknown>).locale;
    if (isLocale(locale)) {
      counts[locale] += 1;
    }
  }
  return counts;
}

export type StatusCounts = Record<TranslationStatus, number>;
export type CoverageByLocale = Record<Locale, StatusCounts>;

/** Rows per locale and status, for the admin dashboard. */
export async function translationStatusByLocale(): Promise<CoverageByLocale> {
  const empty = (): StatusCounts => ({
    MISSING: 0,
    MACHINE_TRANSLATED: 0,
    REVIEW_REQUIRED: 0,
    APPROVED: 0,
    REJECTED: 0,
  });
  const result = Object.fromEntries(LOCALES.map((locale) => [locale, empty()])) as CoverageByLocale;

  let rows: unknown[] = [];
  try {
    rows = await db.orm.public.ContentTranslation.where({}).select('locale', 'status').all();
  } catch {
    return result;
  }

  for (const row of rows) {
    const value = row as Record<string, unknown>;
    if (!isLocale(value.locale)) continue;
    const status = isTranslationStatus(value.status) ? value.status : 'MISSING';
    result[value.locale][status] += 1;
  }
  return result;
}

export type UpsertTranslationInput = {
  entityType: string;
  entityId: string;
  locale: Locale;
  field: string;
  value: string;
  status: TranslationStatus;
  translatedById?: string | null;
  /** SHA-256 of the German source, when the caller knows it. */
  sourceHash?: string | null;
};

/**
 * Create or update one translation by hand.
 *
 * A manual edit clears the provider (the value is now human-authored) and is
 * recorded in the history. German is not a translation target: it is the source.
 */
export async function upsertTranslation(
  input: UpsertTranslationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: 'invalid_locale' | 'invalid_field' | 'empty_value' }> {
  if (!isLocale(input.locale) || input.locale === 'de') {
    return { ok: false, error: 'invalid_locale' };
  }
  if (!isTranslatableField(input.entityType, input.field)) {
    return { ok: false, error: 'invalid_field' };
  }

  const value = input.value.trim();
  if (value.length === 0) {
    return { ok: false, error: 'empty_value' };
  }

  const existing = await db.orm.public.ContentTranslation.where({
    entityType: input.entityType,
    entityId: input.entityId,
    locale: input.locale,
    field: input.field,
  })
    .select('id', 'status')
    .first();

  const payload = {
    value,
    status: input.status,
    provider: null,
    outdated: false,
    translatedById: input.translatedById ?? null,
    ...(input.sourceHash !== undefined ? { sourceHash: input.sourceHash } : {}),
    ...(input.status === 'APPROVED' ? { reviewedAt: Temporal.Now.instant() } : {}),
  };

  if (existing?.id) {
    const previousStatus = String((existing as Record<string, unknown>).status ?? 'MISSING');
    await db.orm.public.ContentTranslation.where({ id: existing.id }).update(payload);
    await recordTranslationEvent({
      translationId: existing.id,
      entityType: input.entityType,
      entityId: input.entityId,
      locale: input.locale,
      field: input.field,
      action: input.status === 'APPROVED' ? 'APPROVED' : 'EDITED',
      fromStatus: previousStatus,
      toStatus: input.status,
      actorId: input.translatedById ?? null,
    });
    return { ok: true, id: existing.id };
  }

  const created = await db.orm.public.ContentTranslation.create({
    entityType: input.entityType,
    entityId: input.entityId,
    locale: input.locale,
    field: input.field,
    ...payload,
  });

  await recordTranslationEvent({
    translationId: String((created as Record<string, unknown>).id ?? ''),
    entityType: input.entityType,
    entityId: input.entityId,
    locale: input.locale,
    field: input.field,
    action: input.status === 'APPROVED' ? 'APPROVED' : 'EDITED',
    fromStatus: 'MISSING',
    toStatus: input.status,
    actorId: input.translatedById ?? null,
  });

  return { ok: true, id: String((created as Record<string, unknown>).id) };
}

/**
 * Approve, reject or send back for review.
 *
 * Approving sets `reviewedAt` and keeps the value; rejecting leaves the value in
 * place but makes it unservable, so nothing is lost and re-approval is one click.
 */
export async function setTranslationStatus(
  id: string,
  status: TranslationStatus,
  reviewerId: string | null,
): Promise<void> {
  const existing = await db.orm.public.ContentTranslation.where({ id })
    .select('id', 'status', 'entityType', 'entityId', 'locale', 'field')
    .first();
  if (!existing) return;

  const row = existing as Record<string, unknown>;

  await db.orm.public.ContentTranslation.where({ id }).update({
    status,
    outdated: false,
    reviewedAt: status === 'APPROVED' ? Temporal.Now.instant() : null,
    ...(reviewerId ? { translatedById: reviewerId } : {}),
  });

  await recordTranslationEvent({
    translationId: id,
    entityType: String(row.entityType ?? ''),
    entityId: String(row.entityId ?? ''),
    locale: String(row.locale ?? ''),
    field: String(row.field ?? ''),
    action:
      status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'EDITED',
    fromStatus: String(row.status ?? 'MISSING'),
    toStatus: status,
    actorId: reviewerId,
  });
}
