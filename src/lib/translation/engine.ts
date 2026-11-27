/**
 * The translation engine.
 *
 * Responsibilities, in one place:
 *
 * 1. **Plan** which (entity, field, locale) pairs are missing or outdated.
 * 2. **Screen** the outgoing text (privacy), protect terms, then translate.
 * 3. **Persist** the result with an honest status — machine output is
 *    `MACHINE_TRANSLATED` (or `REVIEW_REQUIRED` for legal content), never
 *    `APPROVED`.
 * 4. **Never overwrite an approval.** An approved row is skipped; a human must
 *    reject or withdraw it first.
 * 5. **Never pay twice.** A succeeded job for the same source text is reused,
 *    and a current machine translation is not retranslated.
 * 6. **Record** history and cost, without text or credentials.
 *
 * The engine never throws for an expected condition: a batch returns counts plus
 * a per-row outcome, so the admin sees exactly what happened.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/config';
import { db } from '@/lib/db';
import {
  TRANSLATABLE_FIELDS,
  isTranslatableField,
  type TranslationStatus,
} from '@/lib/content-translations';
import { loadTranslatableSources } from './source';
import {
  claimJob,
  getOrCreateJob,
  hashSourceText,
  jobKeyFor,
  markJobFailed,
  markJobSkipped,
  markJobSucceeded,
} from './jobs';
import { recordTranslationEvent, recordTranslationUsage } from './history';
import { describePrivacyFindings, inspectForPrivateData } from './privacy';
import {
  createTranslationProvider,
  readTranslationConfig,
  type TranslationConfig,
  type TranslationEnv,
} from './registry';
import type { TranslationErrorCode, TranslationProvider } from './types';

/** Entities whose translation needs human review by policy. */
const REVIEW_REQUIRED_ENTITIES = new Set(['LegalDocument']);

export type TranslationTarget = {
  entityType: string;
  entityId: string;
  label: string;
  field: string;
  sourceText: string;
  sourceHash: string;
  locale: Locale;
  translationId: string | null;
  value: string;
  status: TranslationStatus;
  provider: string | null;
  outdated: boolean;
};

function rowKey(entityType: string, entityId: string, locale: string, field: string): string {
  return [entityType, entityId, locale, field].join('\u0000');
}

type StoredRow = {
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
};

async function loadAllRows(): Promise<Map<string, StoredRow>> {
  const rows = await db.orm.public.ContentTranslation.where({})
    .select('id', 'entityType', 'entityId', 'locale', 'field', 'value', 'status', 'provider', 'sourceHash', 'outdated')
    .all();

  const map = new Map<string, StoredRow>();
  for (const row of rows) {
    const value = row as Record<string, unknown>;
    if (typeof value.id !== 'string') continue;
    const stored: StoredRow = {
      id: value.id,
      entityType: String(value.entityType ?? ''),
      entityId: String(value.entityId ?? ''),
      locale: String(value.locale ?? ''),
      field: String(value.field ?? ''),
      value: typeof value.value === 'string' ? value.value : '',
      status: String(value.status ?? 'MISSING'),
      provider: typeof value.provider === 'string' ? value.provider : null,
      sourceHash: typeof value.sourceHash === 'string' ? value.sourceHash : null,
      outdated: value.outdated === true,
    };
    map.set(rowKey(stored.entityType, stored.entityId, stored.locale, stored.field), stored);
  }
  return map;
}

function statusOf(value: string): TranslationStatus {
  switch (value) {
    case 'MACHINE_TRANSLATED':
    case 'REVIEW_REQUIRED':
    case 'APPROVED':
    case 'REJECTED':
      return value;
    default:
      return 'MISSING';
  }
}

/**
 * Build the full translation matrix: every published source field × every target
 * locale, joined with whatever is already stored.
 */
export async function collectTranslationTargets(options: {
  locales?: readonly Locale[];
  entityTypes?: readonly string[];
} = {}): Promise<{ targets: TranslationTarget[]; skippedEntityTypes: string[] }> {
  const locales = (options.locales && options.locales.length > 0 ? options.locales : LOCALES).filter(
    (locale) => locale !== DEFAULT_LOCALE,
  );

  const { records, skippedEntityTypes } = await loadTranslatableSources(options.entityTypes);
  let rows = new Map<string, StoredRow>();
  try {
    rows = await loadAllRows();
  } catch {
    // Table missing (migration not applied): everything is simply "missing".
    rows = new Map();
  }

  const targets: TranslationTarget[] = [];
  for (const record of records) {
    for (const field of record.fields) {
      const sourceHash = hashSourceText(field.value);
      for (const locale of locales) {
        const existing = rows.get(rowKey(record.entityType, record.entityId, locale, field.field));
        // Staleness is derived, not only read from the flag: a translation whose
        // stored hash no longer matches the German text is outdated even if the
        // nightly marker has not run yet. A row without a hash is a human
        // translation and is trusted.
        const derivedOutdated = existing
          ? existing.outdated ||
            (existing.sourceHash !== null && existing.sourceHash !== sourceHash)
          : false;

        targets.push({
          entityType: record.entityType,
          entityId: record.entityId,
          label: record.label,
          field: field.field,
          sourceText: field.value,
          sourceHash,
          locale,
          translationId: existing?.id ?? null,
          value: existing?.value ?? '',
          status: statusOf(existing?.status ?? 'MISSING'),
          provider: existing?.provider ?? null,
          outdated: derivedOutdated,
        });
      }
    }
  }

  return { targets, skippedEntityTypes };
}

export type BatchSummary = {
  ok: boolean;
  code?: 'NOT_CONFIGURED';
  provider: string;
  attempted: number;
  translated: number;
  skipped: number;
  blocked: number;
  failed: number;
  characters: number;
  costMicros: number;
  errors: Array<{
    code: TranslationErrorCode | 'APPROVED_PROTECTED' | 'UP_TO_DATE' | 'REJECTED' | 'IN_PROGRESS';
    count: number;
  }>;
  durationMs: number;
};

type TranslationContext = {
  provider: TranslationProvider;
  config: TranslationConfig;
  actorId: string | null;
};

type TranslationPayload = {
  value: string;
  status: TranslationStatus;
  provider: string;
  sourceHash: string;
  outdated: boolean;
  translatedById: null;
  reviewedAt: null;
};

type PersistResult = 'written' | 'approved';

/**
 * Write the translation, adopting a row that appeared while the provider worked.
 *
 * The planned target can be stale: an administrator may have saved the field, or
 * a second worker with a newer source hash may have inserted the row first. A
 * plain `create` would then fail on the unique
 * (entityType, entityId, locale, field) constraint. In that case the stored row
 * is read back and updated only when it is not approved — so the write is never
 * lost and an approval is never overwritten.
 */
async function persistTranslation(
  target: TranslationTarget,
  payload: TranslationPayload,
): Promise<PersistResult> {
  if (target.translationId) {
    await db.orm.public.ContentTranslation.where({ id: target.translationId }).update(payload);
    return 'written';
  }

  try {
    await db.orm.public.ContentTranslation.create({
      entityType: target.entityType,
      entityId: target.entityId,
      locale: target.locale,
      field: target.field,
      ...payload,
    });
    return 'written';
  } catch {
    const existing = await db.orm.public.ContentTranslation.where({
      entityType: target.entityType,
      entityId: target.entityId,
      locale: target.locale,
      field: target.field,
    })
      .select('id', 'status')
      .first();

    if (!existing) throw new Error('translation_row_write_failed');
    const row = existing as Record<string, unknown>;
    if (row.status === 'APPROVED') return 'approved';

    await db.orm.public.ContentTranslation.where({ id: String(row.id) }).update(payload);
    return 'written';
  }
}

type StoredTranslationRow = {
  id: string;
  value: string;
  status: string;
  sourceHash: string | null;
  outdated: boolean;
};

/** The stored row for exactly this (entity, locale, field), or null. */
async function loadStoredTranslation(target: TranslationTarget): Promise<StoredTranslationRow | null> {
  const row = await db.orm.public.ContentTranslation.where({
    entityType: target.entityType,
    entityId: target.entityId,
    locale: target.locale,
    field: target.field,
  })
    .select('id', 'value', 'status', 'sourceHash', 'outdated')
    .first();

  if (!row) return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== 'string') return null;
  return {
    id: value.id,
    value: typeof value.value === 'string' ? value.value : '',
    status: String(value.status ?? ''),
    sourceHash: typeof value.sourceHash === 'string' ? value.sourceHash : null,
    outdated: value.outdated === true,
  };
}

/** Could this row be served as a translation of the planned source text? */
function isServableTranslation(row: StoredTranslationRow | null, target: TranslationTarget): boolean {
  if (!row) return false;
  if (row.value.trim() === '') return false;
  if (row.status === 'REJECTED' || row.status === 'MISSING') return false;
  if (row.outdated) return false;
  if (row.sourceHash !== null && row.sourceHash !== target.sourceHash) return false;
  return true;
}

/** Did another writer change the row after this batch planned the target? */
function changedSincePlanning(row: StoredTranslationRow, target: TranslationTarget): boolean {
  if (row.id !== target.translationId) return true;
  return (
    row.status !== target.status || row.value !== target.value || row.outdated !== target.outdated
  );
}

type TargetOutcome =
  | { kind: 'translated'; characters: number; costMicros: number }
  | { kind: 'skipped'; reason: 'APPROVED_PROTECTED' | 'UP_TO_DATE' | 'REJECTED' | 'IN_PROGRESS' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'failed'; code: TranslationErrorCode };

/** Why a row is in the queue at all. */
function isCandidate(target: TranslationTarget, force: boolean): boolean {
  // An approval is never overwritten, not even by a forced run.
  if (target.status === 'APPROVED') return false;
  if (force) return true;
  if (target.status === 'MISSING' || target.outdated) return true;
  return target.value.trim() === '';
}

/**
 * Translate one field.
 *
 * Order matters: approval check first (never overwrite), then privacy screen
 * (never send personal data), then the idempotency gate (never pay twice), and
 * only then the provider call.
 */
async function translateTarget(
  target: TranslationTarget,
  context: TranslationContext,
  options: { retranslate?: boolean } = {},
): Promise<TargetOutcome> {
  if (target.status === 'APPROVED') {
    return { kind: 'skipped', reason: 'APPROVED_PROTECTED' };
  }
  if (!isTranslatableField(target.entityType, target.field)) {
    return { kind: 'failed', code: 'UNSUPPORTED_PAIR' };
  }
  if (!context.provider.supportsPair(DEFAULT_LOCALE, target.locale)) {
    return { kind: 'failed', code: 'UNSUPPORTED_PAIR' };
  }

  const identity = {
    entityType: target.entityType,
    entityId: target.entityId,
    locale: target.locale,
    field: target.field,
    sourceHash: target.sourceHash,
  };

  const { job, reused } = await getOrCreateJob(identity, {
    provider: context.provider.id,
    requestedById: context.actorId,
  });

  // Privacy screen before any outbound request. The decision is remembered on
  // the job, so an unchanged blocked text is not re-screened and re-logged on
  // every batch.
  const privacy = inspectForPrivateData(target.sourceText);
  if (!privacy.safe) {
    const reason = describePrivacyFindings(privacy.findings);
    if (job.status === 'SKIPPED' && job.errorCode === 'PRIVACY_BLOCKED') {
      return { kind: 'blocked', reason };
    }
    await markJobSkipped(job.id, 'PRIVACY_BLOCKED');
    await recordTranslationEvent({
      translationId: target.translationId,
      entityType: target.entityType,
      entityId: target.entityId,
      locale: target.locale,
      field: target.field,
      action: 'BLOCKED',
      fromStatus: target.status,
      toStatus: target.status,
      provider: context.provider.id,
      actorId: context.actorId,
      note: reason,
    });
    return { kind: 'blocked', reason };
  }

  if (!options.retranslate) {
    // A succeeded job means this exact source text was already paid for and
    // stored. The planned target can be stale — a concurrent batch may have
    // finished while this one was still planning — so the stored row decides,
    // not the snapshot. Without this the second worker would re-claim the
    // finished job (it is no longer RUNNING) and pay for the same text again.
    if (job.status === 'SUCCEEDED') {
      const stored = await loadStoredTranslation(target);
      if (stored && stored.status === 'REJECTED') {
        return { kind: 'skipped', reason: 'REJECTED' };
      }
      if (isServableTranslation(stored, target)) {
        return { kind: 'skipped', reason: 'UP_TO_DATE' };
      }
    }
    if (
      target.translationId !== null &&
      target.status === 'MACHINE_TRANSLATED' &&
      target.provider === context.provider.id &&
      !target.outdated &&
      target.value.trim() !== ''
    ) {
      return { kind: 'skipped', reason: 'UP_TO_DATE' };
    }
    if (target.status === 'REJECTED' && target.translationId !== null) {
      return { kind: 'skipped', reason: 'REJECTED' };
    }
  } else {
    // Explicit retranslation (admin button, forced batch). If another worker
    // stored a usable translation for this text after this batch planned the
    // target, that write wins: paying for it a second time would be a duplicate
    // provider call for identical input.
    const stored = await loadStoredTranslation(target);
    if (
      stored &&
      isServableTranslation(stored, target) &&
      changedSincePlanning(stored, target)
    ) {
      return { kind: 'skipped', reason: 'UP_TO_DATE' };
    }
  }

  if (job.status === 'RUNNING') {
    return { kind: 'skipped', reason: 'IN_PROGRESS' };
  }

  // Claim against the state this batch read: if another worker claimed and
  // finished the job in the meantime, this planner must not run the job again.
  const claimed = await claimJob(job.id, { status: job.status, attempts: job.attempts });
  if (!claimed) {
    return { kind: 'skipped', reason: 'IN_PROGRESS' };
  }

  const outcome = await context.provider.translate({
    text: target.sourceText,
    sourceLocale: DEFAULT_LOCALE,
    targetLocale: target.locale,
    context: target.entityType,
  });

  if (!outcome.ok) {
    await markJobFailed(claimed.id, outcome.code);
    await recordTranslationEvent({
      translationId: target.translationId,
      entityType: target.entityType,
      entityId: target.entityId,
      locale: target.locale,
      field: target.field,
      action: 'FAILED',
      fromStatus: target.status,
      toStatus: target.status,
      provider: context.provider.id,
      actorId: context.actorId,
      note: outcome.code,
    });
    return { kind: 'failed', code: outcome.code };
  }

  const nextStatus: TranslationStatus = REVIEW_REQUIRED_ENTITIES.has(target.entityType)
    ? 'REVIEW_REQUIRED'
    : 'MACHINE_TRANSLATED';

  // Re-read before writing: an approval may have happened while the provider was
  // working. "Never overwrite an approval" has to hold under that race too.
  const current = target.translationId
    ? await db.orm.public.ContentTranslation.where({ id: target.translationId })
        .select('id', 'status')
        .first()
    : null;

  if (current && (current as Record<string, unknown>).status === 'APPROVED') {
    await markJobSkipped(claimed.id, 'APPROVED_PROTECTED');
    return { kind: 'skipped', reason: 'APPROVED_PROTECTED' };
  }

  const payload: TranslationPayload = {
    value: outcome.text.trim(),
    status: nextStatus,
    provider: context.provider.id,
    sourceHash: target.sourceHash,
    outdated: false,
    translatedById: null,
    reviewedAt: null,
  };

  let persisted: PersistResult;
  try {
    persisted = await persistTranslation(target, payload);
  } catch {
    // A storage failure after a paid call must stay visible: the job becomes
    // FAILED with a stable code instead of disappearing into the batch counter.
    await markJobFailed(claimed.id, 'STORAGE_ERROR');
    await recordTranslationEvent({
      translationId: target.translationId,
      entityType: target.entityType,
      entityId: target.entityId,
      locale: target.locale,
      field: target.field,
      action: 'FAILED',
      fromStatus: target.status,
      toStatus: target.status,
      provider: context.provider.id,
      actorId: context.actorId,
      note: 'STORAGE_ERROR',
    });
    return { kind: 'failed', code: 'STORAGE_ERROR' };
  }

  if (persisted === 'approved') {
    await markJobSkipped(claimed.id, 'APPROVED_PROTECTED');
    return { kind: 'skipped', reason: 'APPROVED_PROTECTED' };
  }

  await markJobSucceeded(claimed.id, outcome.characters);

  const costMicros = context.provider.costMicros(outcome.characters);
  await recordTranslationUsage({
    provider: context.provider.id,
    locale: target.locale,
    characters: outcome.characters,
    costMicros,
  });

  await recordTranslationEvent({
    translationId: target.translationId,
    entityType: target.entityType,
    entityId: target.entityId,
    locale: target.locale,
    field: target.field,
    action: options.retranslate ? 'RETRANSLATED' : 'MACHINE_TRANSLATED',
    fromStatus: target.status,
    toStatus: nextStatus,
    provider: context.provider.id,
    actorId: context.actorId,
    note: reused ? 'job_reused' : null,
  });

  return { kind: 'translated', characters: outcome.characters, costMicros };
}

function resolveContext(
  env: TranslationEnv,
  overrides: { provider?: TranslationProvider; actorId?: string | null } = {},
): { ok: true; context: TranslationContext } | { ok: false; summary: BatchSummary } {
  const config = readTranslationConfig(env);
  const provider = overrides.provider ?? createTranslationProvider(config, env);

  if (!provider) {
    return {
      ok: false,
      summary: {
        ok: false,
        code: 'NOT_CONFIGURED',
        provider: config.provider,
        attempted: 0,
        translated: 0,
        skipped: 0,
        blocked: 0,
        failed: 0,
        characters: 0,
        costMicros: 0,
        errors: [],
        durationMs: 0,
      },
    };
  }

  return {
    ok: true,
    context: { provider, config, actorId: overrides.actorId ?? null },
  };
}

export type RunBatchOptions = {
  locales: readonly Locale[];
  entityTypes?: readonly string[];
  limit?: number;
  /** Also re-translate current machine output (never approved rows). */
  force?: boolean;
  actorId?: string | null;
  env?: TranslationEnv;
  provider?: TranslationProvider;
};

/**
 * Translate a bounded batch of missing/outdated fields.
 *
 * The batch size is capped by configuration so one admin click (or one cron run)
 * never exceeds a function timeout and never floods the provider.
 */
export async function runTranslationBatch(options: RunBatchOptions): Promise<BatchSummary> {
  const startedAt = Date.now();
  const env = options.env ?? process.env;
  const resolved = resolveContext(env, { provider: options.provider, actorId: options.actorId });
  if (!resolved.ok) {
    return resolved.summary;
  }

  const { context } = resolved;
  const limit = Math.max(1, Math.min(options.limit ?? context.config.batchLimit, context.config.batchLimit));

  const { targets } = await collectTranslationTargets({
    locales: options.locales,
    entityTypes: options.entityTypes,
  });

  const candidates = targets
    .filter((target) => isCandidate(target, options.force === true))
    .slice(0, limit);

  const summary: BatchSummary = {
    ok: true,
    provider: context.provider.id,
    attempted: candidates.length,
    translated: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    characters: 0,
    costMicros: 0,
    errors: [],
    durationMs: 0,
  };

  const addError = (code: BatchSummary['errors'][number]['code']): void => {
    const existing = summary.errors.find((entry) => entry.code === code);
    if (existing) existing.count += 1;
    else summary.errors.push({ code, count: 1 });
  };

  for (const target of candidates) {
    try {
      const outcome = await translateTarget(target, context, {
        retranslate: options.force === true && target.status !== 'MISSING' && !target.outdated,
      });

      if (outcome.kind === 'translated') {
        summary.translated += 1;
        summary.characters += outcome.characters;
        summary.costMicros += outcome.costMicros;
      } else if (outcome.kind === 'skipped') {
        summary.skipped += 1;
        addError(outcome.reason);
      } else if (outcome.kind === 'blocked') {
        summary.blocked += 1;
        addError('PRIVACY_BLOCKED');
      } else {
        summary.failed += 1;
        addError(outcome.code);
      }
    } catch (error) {
      summary.failed += 1;
      addError('PROVIDER_ERROR');
      console.error(
        JSON.stringify({
          event: 'translation.batch.row_failed',
          entityType: target.entityType,
          entityId: target.entityId,
          locale: target.locale,
          field: target.field,
          reason: error instanceof Error ? error.name : 'unknown',
        }),
      );
    }
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}

/** Translate exactly one field (the "erneut übersetzen" button). */
export async function retranslateField(input: {
  entityType: string;
  entityId: string;
  field: string;
  locale: Locale;
  actorId?: string | null;
  env?: TranslationEnv;
  provider?: TranslationProvider;
}): Promise<
  | { ok: true; kind: 'translated' | 'blocked' | 'failed' | 'skipped'; code?: string }
  | { ok: false; code: 'NOT_CONFIGURED' | 'NOT_FOUND' | 'APPROVED_PROTECTED' }
> {
  const env = input.env ?? process.env;
  const resolved = resolveContext(env, { provider: input.provider, actorId: input.actorId ?? null });
  if (!resolved.ok) {
    return { ok: false, code: 'NOT_CONFIGURED' };
  }

  const { targets } = await collectTranslationTargets({
    locales: [input.locale],
    entityTypes: [input.entityType],
  });
  const target = targets.find(
    (entry) => entry.entityId === input.entityId && entry.field === input.field,
  );
  if (!target) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  if (target.status === 'APPROVED') {
    return { ok: false, code: 'APPROVED_PROTECTED' };
  }

  const outcome = await translateTarget(target, resolved.context, { retranslate: true });
  if (outcome.kind === 'translated') return { ok: true, kind: 'translated' };
  if (outcome.kind === 'blocked') return { ok: true, kind: 'blocked', code: 'PRIVACY_BLOCKED' };
  if (outcome.kind === 'failed') return { ok: true, kind: 'failed', code: outcome.code };
  return { ok: true, kind: 'skipped', code: outcome.reason };
}

export type OutdatedResult = { marked: number; checked: number };

/**
 * Mark stored translations whose German source changed.
 *
 * Called by the cron worker and before a batch runs. It never touches an
 * approved row's value: the value stays, but `outdated` makes the row unservable
 * (`getApprovedTranslations` ignores outdated rows) until a human re-translates
 * or re-approves it.
 */
export async function markOutdatedTranslations(): Promise<OutdatedResult> {
  const { records } = await loadTranslatableSources();
  let rows: StoredRow[] = [];
  try {
    const loaded = await loadAllRows();
    rows = [...loaded.values()];
  } catch {
    return { marked: 0, checked: 0 };
  }

  const hashes = new Map<string, string>();
  for (const record of records) {
    for (const field of record.fields) {
      hashes.set(rowKey(record.entityType, record.entityId, DEFAULT_LOCALE, field.field), hashSourceText(field.value));
    }
  }

  let marked = 0;
  for (const row of rows) {
    if (row.sourceHash === null) continue; // human-written, no source link
    const current = hashes.get(rowKey(row.entityType, row.entityId, DEFAULT_LOCALE, row.field));
    if (current === undefined) continue; // source deleted or unpublished
    if (current === row.sourceHash || row.outdated) continue;

    await db.orm.public.ContentTranslation.where({ id: row.id }).update({ outdated: true });
    await recordTranslationEvent({
      translationId: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      locale: row.locale,
      field: row.field,
      action: 'MARKED_OUTDATED',
      fromStatus: row.status,
      toStatus: row.status,
      note: 'source_changed',
    });
    marked += 1;
  }

  return { marked, checked: rows.length };
}

/** Fields of one entity, for the source/translation side-by-side view. */
export function translatableFieldsOf(entityType: string): readonly string[] {
  return TRANSLATABLE_FIELDS[entityType] ?? [];
}

export type WorkerResult = { outdated: number; batch: BatchSummary };

/**
 * Background worker entry point (cron / systemd timer).
 *
 * The durable queue is `TranslationJob`. A worker run first marks translations
 * whose German source changed, then plans work for the entity types and locales
 * that still have pending jobs — so a failed or interrupted batch is retried
 * exactly, and a stored job is never paid for twice.
 *
 * `limit` bounds one run so the function finishes inside its timeout.
 */
export async function runTranslationWorker(options: {
  limit?: number;
  env?: TranslationEnv;
  provider?: TranslationProvider;
} = {}): Promise<WorkerResult> {
  const { listPendingJobs } = await import('./jobs');
  const pending = await listPendingJobs(options.limit ?? 50).catch(() => []);

  const locales = new Set<Locale>();
  const entityTypes = new Set<string>();
  for (const job of pending) {
    if (LOCALES.includes(job.locale as Locale) && job.locale !== DEFAULT_LOCALE) {
      locales.add(job.locale as Locale);
    }
    entityTypes.add(job.entityType);
  }

  const outdated = await markOutdatedTranslations().catch(() => ({ marked: 0, checked: 0 }));

  const batch = await runTranslationBatch({
    locales: locales.size > 0 ? [...locales] : LOCALES.filter((locale) => locale !== DEFAULT_LOCALE),
    entityTypes: entityTypes.size > 0 ? [...entityTypes] : undefined,
    limit: options.limit,
    env: options.env,
    provider: options.provider,
  });

  return { outdated: outdated.marked, batch };
}

/** Job key helper exposed for diagnostics and tests. */
export { jobKeyFor };
