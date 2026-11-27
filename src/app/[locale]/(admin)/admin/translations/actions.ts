'use server';

/**
 * Admin actions for content translations.
 *
 * Authorization is re-checked here, in the database, and never trusted from the
 * form: `requireAdminSession()` resolves the linked session and reads the
 * current role. The role model itself is unchanged — the existing ADMIN
 * permission is sufficient, so no new permission was introduced.
 *
 * Every action is a plain form action (no client state), so the page works
 * without JavaScript and each outcome is visible in the URL. The API key never
 * passes through a form: the provider is resolved server-side from the
 * environment.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/server-auth';
import { LOCALES, isLocale, type Locale } from '@/i18n/config';
import {
  SETTABLE_STATUSES,
  isTranslatableField,
  isTranslationStatus,
  setTranslationStatus,
  upsertTranslation,
} from '@/lib/content-translations';
import { markOutdatedTranslations, retranslateField, runTranslationBatch } from '@/lib/translation/engine';
import { listSourceEntityTypes } from '@/lib/translation/source';
import { revalidateTranslations } from '@/lib/revalidate';

/**
 * Revalidate the admin overview and every public surface that shows dynamic
 * content. The public side matters: an approval must become visible on the
 * website without waiting for the cache lifetime, and a withdrawal must remove
 * the translation.
 */
function revalidateOverview(): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/translations`);
  }
  revalidateTranslations();
}

function backTo(locale: string, query: string): never {
  redirect(`/${locale}/admin/translations${query}`);
}

/** Only form values from the allowlist may reach the engine. */
function selectedLocales(formData: FormData): Locale[] {
  return formData
    .getAll('locales')
    .map((value) => String(value))
    .filter((value): value is Locale => isLocale(value) && value !== 'de');
}

function selectedEntityTypes(formData: FormData): string[] {
  const known = new Set(listSourceEntityTypes());
  return formData
    .getAll('entityTypes')
    .map((value) => String(value))
    .filter((value) => known.has(value));
}

export async function saveTranslationAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('returnLocale') ?? 'de');
  const session = await requireAdminSession().catch(() => null);
  if (!session) {
    backTo(locale, '?error=forbidden');
  }

  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '');
  const field = String(formData.get('field') ?? '');
  const targetLocale = String(formData.get('locale') ?? '');
  const value = String(formData.get('value') ?? '');
  const status = String(formData.get('status') ?? 'REVIEW_REQUIRED');

  if (!isLocale(targetLocale) || targetLocale === 'de') {
    backTo(locale, '?error=invalid_locale');
  }
  if (!isTranslatableField(entityType, field)) {
    backTo(locale, '?error=invalid_field');
  }
  if (!isTranslationStatus(status)) {
    backTo(locale, '?error=invalid_status');
  }

  const result = await upsertTranslation({
    entityType,
    entityId,
    locale: targetLocale,
    field,
    value,
    status,
    translatedById: session.id,
  });

  if (!result.ok) {
    backTo(locale, `?error=${result.error}`);
  }

  revalidateOverview();
  backTo(locale, '?saved=1');
}

export async function setTranslationStatusAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('returnLocale') ?? 'de');
  const session = await requireAdminSession().catch(() => null);
  if (!session) {
    backTo(locale, '?error=forbidden');
  }

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');

  // Only the three reviewable states are settable by hand; MISSING and
  // MACHINE_TRANSLATED are produced by the engine.
  if (!id || !(SETTABLE_STATUSES as readonly string[]).includes(status)) {
    backTo(locale, '?error=invalid_status');
  }

  await setTranslationStatus(id, status as (typeof SETTABLE_STATUSES)[number], session.id);
  revalidateOverview();
  backTo(locale, '?saved=1');
}

/**
 * Start a machine-translation batch.
 *
 * The batch is bounded by `TRANSLATION_BATCH_LIMIT`, approved translations are
 * never touched, and a missing provider key simply produces `notConfigured=1`
 * instead of an error page.
 */
export async function startTranslationAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('returnLocale') ?? 'de');
  const session = await requireAdminSession().catch(() => null);
  if (!session) {
    backTo(locale, '?error=forbidden');
  }

  const locales = selectedLocales(formData);
  if (locales.length === 0) {
    backTo(locale, '?error=no_locale');
  }

  const entityTypes = selectedEntityTypes(formData);
  const force = formData.get('force') === 'on';

  const summary = await runTranslationBatch({
    locales,
    entityTypes: entityTypes.length > 0 ? entityTypes : undefined,
    force,
    actorId: session.id,
  }).catch(() => null);

  if (!summary) {
    backTo(locale, '?error=batch_failed');
  }
  if (summary.code === 'NOT_CONFIGURED') {
    backTo(locale, '?notConfigured=1');
  }

  revalidateOverview();
  const params = new URLSearchParams({
    translated: String(summary.translated),
    skipped: String(summary.skipped),
    blocked: String(summary.blocked),
    failed: String(summary.failed),
    characters: String(summary.characters),
    provider: summary.provider,
  });
  backTo(locale, `?${params.toString()}`);
}

/** Re-translate one field. An approved translation is refused, never replaced. */
export async function retranslateAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('returnLocale') ?? 'de');
  const session = await requireAdminSession().catch(() => null);
  if (!session) {
    backTo(locale, '?error=forbidden');
  }

  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '');
  const field = String(formData.get('field') ?? '');
  const targetLocale = String(formData.get('locale') ?? '');

  if (!isLocale(targetLocale) || targetLocale === 'de' || !isTranslatableField(entityType, field)) {
    backTo(locale, '?error=invalid_field');
  }

  const result = await retranslateField({
    entityType,
    entityId,
    field,
    locale: targetLocale,
    actorId: session.id,
  }).catch(() => null);

  if (!result) {
    backTo(locale, '?error=retranslate_failed');
  }
  if (!result.ok) {
    backTo(locale, `?error=${result.code.toLowerCase()}`);
  }

  revalidateOverview();
  backTo(locale, `?retranslated=${result.kind}`);
}

/** Mark translations whose German source changed as outdated. */
export async function refreshOutdatedAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('returnLocale') ?? 'de');
  const session = await requireAdminSession().catch(() => null);
  if (!session) {
    backTo(locale, '?error=forbidden');
  }

  const result = await markOutdatedTranslations().catch(() => ({ marked: 0, checked: 0 }));
  revalidateOverview();
  backTo(locale, `?outdated=${result.marked}`);
}

