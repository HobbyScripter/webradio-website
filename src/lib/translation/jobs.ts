/**
 * Persistent job queue for machine translation.
 *
 * There is no external queue in this project — Vercel functions plus a cron
 * trigger are the background processing that exists. `TranslationJob` therefore
 * *is* the queue: a row is created as `PENDING`, claimed by a worker, and either
 * finished or failed with a stable error code. The unique `jobKey` gives
 * idempotency: the same (entity, locale, field, source text) can be requested
 * any number of times without a second paid API call.
 *
 * Claiming uses a conditional update on `status`, so two concurrent workers
 * (two cron runs, an admin action during a cron run) cannot both process the
 * same job in PostgreSQL.
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { Locale } from '@/i18n/config';
import type { TranslationErrorCode } from './types';

export const TRANSLATION_JOB_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
] as const;
export type TranslationJobStatus = (typeof TRANSLATION_JOB_STATUSES)[number];

export type TranslationJob = {
  id: string;
  jobKey: string;
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  provider: string;
  status: string;
  attempts: number;
  errorCode: string | null;
  sourceHash: string;
  characters: number;
  startedAt: unknown;
  finishedAt: unknown;
};

export type JobIdentity = {
  entityType: string;
  entityId: string;
  locale: Locale;
  field: string;
  sourceHash: string;
};

/** Stable SHA-256 hash of the source text. Also used for outdated detection. */
export function hashSourceText(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex');
}

/**
 * Idempotency key.
 *
 * The source hash is part of it, so edited German text produces a *new* job —
 * a retranslation, not a silent reuse of a stale result.
 */
export function jobKeyFor(identity: JobIdentity): string {
  return createHash('sha256')
    .update(
      [identity.entityType, identity.entityId, identity.locale, identity.field, identity.sourceHash].join(
        '\u0000',
      ),
      'utf8',
    )
    .digest('hex');
}

function mapJob(row: unknown): TranslationJob | null {
  const value = row as Record<string, unknown>;
  if (!value || typeof value.id !== 'string' || typeof value.jobKey !== 'string') {
    return null;
  }
  return {
    id: value.id,
    jobKey: value.jobKey,
    entityType: String(value.entityType ?? ''),
    entityId: String(value.entityId ?? ''),
    locale: String(value.locale ?? ''),
    field: String(value.field ?? ''),
    provider: String(value.provider ?? ''),
    status: String(value.status ?? 'PENDING'),
    attempts: typeof value.attempts === 'number' ? value.attempts : 0,
    errorCode: typeof value.errorCode === 'string' ? value.errorCode : null,
    sourceHash: String(value.sourceHash ?? ''),
    characters: typeof value.characters === 'number' ? value.characters : 0,
    startedAt: value.startedAt ?? null,
    finishedAt: value.finishedAt ?? null,
  };
}

export async function findJob(jobKey: string): Promise<TranslationJob | null> {
  const row = await db.orm.public.TranslationJob.where({ jobKey }).select('id', 'jobKey', 'entityType', 'entityId', 'locale', 'field', 'provider', 'status', 'attempts', 'errorCode', 'sourceHash', 'characters', 'startedAt', 'finishedAt').first();
  return mapJob(row);
}

/**
 * Create the job if it does not exist yet.
 *
 * A concurrent insert loses the unique constraint and is then simply read back,
 * which is exactly the semantics an idempotent producer needs.
 */
export async function getOrCreateJob(
  identity: JobIdentity,
  options: { provider: string; requestedById?: string | null },
): Promise<{ job: TranslationJob; reused: boolean }> {
  const jobKey = jobKeyFor(identity);

  const existing = await findJob(jobKey);
  if (existing) {
    return { job: existing, reused: true };
  }

  try {
    const created = await db.orm.public.TranslationJob.create({
      jobKey,
      entityType: identity.entityType,
      entityId: identity.entityId,
      locale: identity.locale,
      field: identity.field,
      provider: options.provider,
      status: 'PENDING',
      attempts: 0,
      sourceHash: identity.sourceHash,
      characters: 0,
      requestedById: options.requestedById ?? null,
    });
    const job = mapJob(created);
    if (job) {
      return { job, reused: false };
    }
  } catch {
    // Unique violation (another worker won the race) — read it back.
  }

  const raced = await findJob(jobKey);
  if (raced) {
    return { job: raced, reused: true };
  }

  throw new Error('translation_job_create_failed');
}

/**
 * Claim a job for processing.
 *
 * Returns `null` when another worker already holds or has finished the claim.
 *
 * The claim is atomic: the row is read with `SELECT … FOR UPDATE` inside one
 * transaction, so a concurrent worker blocks until the first commits and then
 * sees `RUNNING` and gives up. The update follows in the same transaction, and
 * `attempts` is incremented by the database itself (`attempts + 1`) instead of
 * from a stale value read outside the lock. Two workers can therefore never
 * both hold the same job, which is what prevents duplicate provider calls and
 * duplicate `ContentTranslation` inserts.
 *
 * Callers that planned against a job they read earlier pass that snapshot as
 * `expected`. The comparison happens under the lock, so a job that was finished
 * by another worker in the meantime is not claimed again — a stale planner must
 * not pay for text that has already been translated.
 */
export async function claimJob(
  jobId: string,
  expected?: { status: string; attempts: number },
): Promise<TranslationJob | null> {
  const claimedAt = Temporal.Now.instant();

  return db.transaction(async (tx) => {
    const current = await tx.orm.public.TranslationJob.where({ id: jobId })
      .select(
        'id',
        'jobKey',
        'entityType',
        'entityId',
        'locale',
        'field',
        'provider',
        'status',
        'attempts',
        'errorCode',
        'sourceHash',
        'characters',
        'startedAt',
        'finishedAt',
      )
      .forUpdate()
      .first();

    const job = mapJob(current);
    if (!job || job.status === 'RUNNING') {
      return null;
    }

    if (expected && (job.status !== expected.status || job.attempts !== expected.attempts)) {
      return null;
    }

    await tx.execute(
      tx.raw.sql`UPDATE "TranslationJob"
        SET "status" = 'RUNNING',
            "attempts" = "attempts" + 1,
            "startedAt" = now(),
            "finishedAt" = NULL,
            "errorCode" = NULL,
            "updatedAt" = now()
        WHERE "id" = ${jobId}`.affectedCount().build(),
    );

    return {
      ...job,
      status: 'RUNNING',
      attempts: job.attempts + 1,
      startedAt: claimedAt,
      finishedAt: null,
      errorCode: null,
    } satisfies TranslationJob;
  });
}

export async function markJobSucceeded(jobId: string, characters: number): Promise<void> {
  await db.orm.public.TranslationJob.where({ id: jobId }).update({
    status: 'SUCCEEDED',
    characters,
    errorCode: null,
    finishedAt: Temporal.Now.instant(),
  });
}

export async function markJobFailed(jobId: string, code: TranslationErrorCode): Promise<void> {
  await db.orm.public.TranslationJob.where({ id: jobId }).update({
    status: 'FAILED',
    errorCode: code,
    finishedAt: Temporal.Now.instant(),
  });
}

export async function markJobSkipped(jobId: string, reason: string): Promise<void> {
  await db.orm.public.TranslationJob.where({ id: jobId }).update({
    status: 'SKIPPED',
    errorCode: reason,
    finishedAt: Temporal.Now.instant(),
  });
}

/** Jobs left behind by a crashed worker, offered to the cron worker again. */
export async function listPendingJobs(limit: number): Promise<TranslationJob[]> {
  const rows = await db.orm.public.TranslationJob.where({ status: 'PENDING' })
    .select('id', 'jobKey', 'entityType', 'entityId', 'locale', 'field', 'provider', 'status', 'attempts', 'errorCode', 'sourceHash', 'characters', 'startedAt', 'finishedAt')
    .all();
  return rows
    .map(mapJob)
    .filter((job): job is TranslationJob => job !== null)
    .sort((a, b) => a.jobKey.localeCompare(b.jobKey))
    .slice(0, Math.max(0, limit));
}

export type JobStats = {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export async function jobStats(): Promise<JobStats> {
  const stats: JobStats = { pending: 0, running: 0, succeeded: 0, failed: 0, skipped: 0 };
  let rows: unknown[] = [];
  try {
    rows = await db.orm.public.TranslationJob.where({}).select('status').all();
  } catch {
    return stats;
  }

  for (const row of rows) {
    const status = String((row as Record<string, unknown>).status ?? '');
    if (status === 'PENDING') stats.pending += 1;
    else if (status === 'RUNNING') stats.running += 1;
    else if (status === 'SUCCEEDED') stats.succeeded += 1;
    else if (status === 'FAILED') stats.failed += 1;
    else if (status === 'SKIPPED') stats.skipped += 1;
  }
  return stats;
}
