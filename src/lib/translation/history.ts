/**
 * Append-only telemetry of the translation engine.
 *
 * Two independent trails:
 *
 * - `TranslationEvent` — who changed which translation, from which status to
 *   which, with which provider. Never updated, never deleted, so the difference
 *   between "machine translated" and "approved by a human" stays provable.
 * - `TranslationUsage` — characters actually billed, with the cost frozen at
 *   write time. A later price change never rewrites history.
 *
 * Neither trail contains the translated text or the API key.
 */
import { db } from '@/lib/db';
import { LOCALES, type Locale } from '@/i18n/config';

export const TRANSLATION_ACTIONS = [
  'MACHINE_TRANSLATED',
  'EDITED',
  'APPROVED',
  'REJECTED',
  'RETRANSLATED',
  'MARKED_OUTDATED',
  'BLOCKED',
  'FAILED',
] as const;
export type TranslationAction = (typeof TRANSLATION_ACTIONS)[number];

export type TranslationEventInput = {
  translationId?: string | null;
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  action: TranslationAction;
  fromStatus?: string | null;
  toStatus?: string | null;
  provider?: string | null;
  actorId?: string | null;
  note?: string | null;
};

/** Append one event. A logging failure must never fail the translation itself. */
export async function recordTranslationEvent(input: TranslationEventInput): Promise<void> {
  try {
    await db.orm.public.TranslationEvent.create({
      translationId: input.translationId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      locale: input.locale,
      field: input.field,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      provider: input.provider ?? null,
      actorId: input.actorId ?? null,
      note: input.note ?? null,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'translation.history.write_failed',
        action: input.action,
        reason: error instanceof Error ? error.name : 'unknown',
      }),
    );
  }
}

export type TranslationEventRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  fromStatus: string | null;
  toStatus: string | null;
  provider: string | null;
  note: string | null;
  createdAt: string;
};

function asIso(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return String(value.toString());
  }
  return String(value);
}

/** Newest events first. Read-only, bounded. */
export async function listTranslationHistory(limit = 50): Promise<TranslationEventRow[]> {
  let rows: unknown[] = [];
  try {
    rows = await db.orm.public.TranslationEvent.where({})
      .select(
        'id',
        'action',
        'entityType',
        'entityId',
        'locale',
        'field',
        'fromStatus',
        'toStatus',
        'provider',
        'note',
        'createdAt',
      )
      .all();
  } catch {
    return [];
  }

  return rows
    .map((row) => {
      const value = row as Record<string, unknown>;
      if (typeof value.id !== 'string') return null;
      return {
        id: value.id,
        action: String(value.action ?? ''),
        entityType: String(value.entityType ?? ''),
        entityId: String(value.entityId ?? ''),
        locale: String(value.locale ?? ''),
        field: String(value.field ?? ''),
        fromStatus: typeof value.fromStatus === 'string' ? value.fromStatus : null,
        toStatus: typeof value.toStatus === 'string' ? value.toStatus : null,
        provider: typeof value.provider === 'string' ? value.provider : null,
        note: typeof value.note === 'string' ? value.note : null,
        createdAt: asIso(value.createdAt),
      } satisfies TranslationEventRow;
    })
    .filter((row): row is TranslationEventRow => row !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, limit));
}

export type UsageRecordInput = {
  provider: string;
  locale: string;
  characters: number;
  costMicros: number;
  quotaUsed?: number | null;
  quotaLimit?: number | null;
};

/** Record one accepted API call. Never contains text or credentials. */
export async function recordTranslationUsage(input: UsageRecordInput): Promise<void> {
  try {
    await db.orm.public.TranslationUsage.create({
      provider: input.provider,
      locale: input.locale,
      characters: Math.max(0, Math.round(input.characters)),
      requests: 1,
      costMicros: Math.max(0, Math.round(input.costMicros)),
      quotaUsed: input.quotaUsed ?? null,
      quotaLimit: input.quotaLimit ?? null,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'translation.usage.write_failed',
        provider: input.provider,
        reason: error instanceof Error ? error.name : 'unknown',
      }),
    );
  }
}

export type UsageSummary = {
  todayCharacters: number;
  todayCostMicros: number;
  monthCharacters: number;
  monthCostMicros: number;
  totalCharacters: number;
  totalCostMicros: number;
  requests: number;
  perLocale: Record<Locale, number>;
  perProvider: Array<{ provider: string; characters: number; costMicros: number }>;
  lastCallAt: string | null;
  /** Latest provider-reported quota, when a call returned one. */
  quota: { used: number; limit: number } | null;
};

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Aggregate what was spent. Reads at most `limit` usage rows (newest first by
 * insertion order, which is already chronological) so the dashboard stays cheap
 * on a long-running installation.
 */
export async function translationUsageSummary(
  options: { now?: Date; limit?: number } = {},
): Promise<UsageSummary> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5_000;

  let rows: unknown[] = [];
  try {
    rows = await db.orm.public.TranslationUsage.where({})
      .select('provider', 'locale', 'characters', 'costMicros', 'requests', 'quotaUsed', 'quotaLimit', 'createdAt')
      .all();
  } catch {
    rows = [];
  }

  const dayStart = startOfUtcDay(now).getTime();
  const monthStart = startOfUtcMonth(now).getTime();

  const summary: UsageSummary = {
    todayCharacters: 0,
    todayCostMicros: 0,
    monthCharacters: 0,
    monthCostMicros: 0,
    totalCharacters: 0,
    totalCostMicros: 0,
    requests: 0,
    perLocale: Object.fromEntries(LOCALES.map((locale) => [locale, 0])) as Record<Locale, number>,
    perProvider: [],
    lastCallAt: null,
    quota: null,
  };

  const providers = new Map<string, { characters: number; costMicros: number }>();
  let latestQuota: { used: number; limit: number; at: number } | null = null;

  for (const row of rows.slice(-limit)) {
    const value = row as Record<string, unknown>;
    const characters = typeof value.characters === 'number' ? value.characters : 0;
    const costMicros = typeof value.costMicros === 'number' ? value.costMicros : 0;
    const provider = String(value.provider ?? 'unknown');
    const locale = String(value.locale ?? '');
    const createdAt = asIso(value.createdAt);
    const at = Date.parse(createdAt);

    summary.totalCharacters += characters;
    summary.totalCostMicros += costMicros;
    summary.requests += typeof value.requests === 'number' ? value.requests : 1;

    if (Number.isFinite(at) && at >= dayStart) {
      summary.todayCharacters += characters;
      summary.todayCostMicros += costMicros;
    }
    if (Number.isFinite(at) && at >= monthStart) {
      summary.monthCharacters += characters;
      summary.monthCostMicros += costMicros;
    }
    if (LOCALES.includes(locale as Locale)) {
      summary.perLocale[locale as Locale] += characters;
    }
    if (Number.isFinite(at) && (summary.lastCallAt === null || at > Date.parse(summary.lastCallAt))) {
      summary.lastCallAt = createdAt;
    }

    const entry = providers.get(provider) ?? { characters: 0, costMicros: 0 };
    entry.characters += characters;
    entry.costMicros += costMicros;
    providers.set(provider, entry);

    const quotaUsed = typeof value.quotaUsed === 'number' ? value.quotaUsed : null;
    const quotaLimit = typeof value.quotaLimit === 'number' ? value.quotaLimit : null;
    if (quotaUsed !== null && quotaLimit !== null && Number.isFinite(at)) {
      if (latestQuota === null || at >= latestQuota.at) {
        latestQuota = { used: quotaUsed, limit: quotaLimit, at };
      }
    }
  }

  summary.perProvider = [...providers.entries()].map(([provider, entry]) => ({
    provider,
    ...entry,
  }));
  if (latestQuota !== null) {
    summary.quota = { used: latestQuota.used, limit: latestQuota.limit };
  }

  return summary;
}
