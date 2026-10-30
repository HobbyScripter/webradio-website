'use server';

/**
 * Server actions for the developer dashboard forms.
 *
 * Each action resolves the acting user from the database session, delegates to
 * `developer-catalog-service` (which re-checks role and ownership) and writes an
 * audit entry there. The UI never talks to the database directly.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireDeveloperSession } from '@/lib/server-auth';
import { AuthError, logServerError } from '@/lib/auth-service';
import { consumeRateLimitSafely } from '@/lib/rate-limit';
import {
  addCatalogVersion,
  createCatalogEntry,
  deleteCatalogEntry,
  submitCatalogEntry,
  updateCatalogEntry,
  withdrawCatalogEntry,
} from '@/lib/developer-catalog-service';
import type { CatalogKind } from '@/lib/catalog-workflow';

const BASE_PATH: Record<CatalogKind, string> = {
  PLUGIN: '/developer/plugins',
  THEME: '/developer/themes',
};

const CREATE_PATH: Record<CatalogKind, string> = {
  PLUGIN: '/developer/plugins/create',
  THEME: '/developer/themes/create',
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key).trim();
  return value === '' ? undefined : value;
}

async function actionMeta() {
  const headerBag = await headers();
  return { userAgent: headerBag.get('user-agent') ?? undefined };
}

function errorRedirect(path: string, error: unknown, scope: string): string {
  if (error instanceof AuthError) {
    return `${path}?error=${encodeURIComponent(error.message)}`;
  }
  logServerError(scope, error);
  return `${path}?error=${encodeURIComponent('Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.')}`;
}

async function enforceContentRateLimit(userId: string): Promise<void> {
  const decision = await consumeRateLimitSafely({
    scope: 'contentWrite',
    identifier: userId,
  });
  if (!decision.allowed) {
    throw new AuthError(
      'Zu viele Änderungen in kurzer Zeit. Bitte warte einen Moment.',
      429,
      'RATE_LIMITED',
    );
  }
}

function parseVersion(formData: FormData) {
  const fileSize = Number.parseInt(readString(formData, 'fileSize'), 10);
  return {
    version: readString(formData, 'version').trim(),
    description: optionalString(formData, 'description'),
    fileUrl: readString(formData, 'fileUrl').trim(),
    fileSize: Number.isFinite(fileSize) ? fileSize : 0,
    checksum: readString(formData, 'checksum').trim(),
    minWebradioVersion: optionalString(formData, 'minWebradioVersion'),
    maxWebradioVersion: optionalString(formData, 'maxWebradioVersion'),
  };
}

async function createEntry(kind: CatalogKind, formData: FormData): Promise<never> {
  const user = await requireDeveloperSession();
  const intent = readString(formData, 'intent');
  let target: string;

  try {
    await enforceContentRateLimit(user.id);
    const result = await createCatalogEntry({
      actorId: user.id,
      kind,
      raw: {
        slug: readString(formData, 'slug').trim(),
        name: readString(formData, 'name').trim(),
        description: readString(formData, 'description').trim(),
        ...(kind === 'PLUGIN'
          ? { repositoryUrl: readString(formData, 'repositoryUrl').trim() }
          : {}),
        product: 'WEBRADIO',
        saveAsDraft: intent === 'draft',
      },
      meta: await actionMeta(),
    });

    revalidatePath(BASE_PATH[kind]);
    target =
      intent === 'draft'
        ? `${BASE_PATH[kind]}/${result.slug}?draft=1`
        : `${BASE_PATH[kind]}/${result.slug}?created=1`;
  } catch (error) {
    target = errorRedirect(CREATE_PATH[kind], error, `action:${kind.toLowerCase()}:create`);
  }

  redirect(target);
}

async function updateEntry(kind: CatalogKind, formData: FormData): Promise<never> {
  const user = await requireDeveloperSession();
  const entryId = readString(formData, 'id');
  const slug = readString(formData, 'slug');
  let target: string;

  try {
    await enforceContentRateLimit(user.id);
    const result = await updateCatalogEntry({
      actorId: user.id,
      kind,
      entryId,
      raw: {
        slug,
        name: readString(formData, 'name').trim(),
        description: readString(formData, 'description').trim(),
        ...(kind === 'PLUGIN'
          ? { repositoryUrl: readString(formData, 'repositoryUrl').trim() }
          : {}),
        product: 'WEBRADIO',
      },
      meta: await actionMeta(),
    });

    revalidatePath(BASE_PATH[kind]);
    target = result.requiresReReview
      ? `${BASE_PATH[kind]}/${result.slug}/edit?resubmitted=1`
      : `${BASE_PATH[kind]}/${result.slug}/edit?updated=1`;
  } catch (error) {
    target = errorRedirect(`${BASE_PATH[kind]}/${slug}/edit`, error, `action:${kind}:update`);
  }

  redirect(target);
}

async function removeEntry(kind: CatalogKind, formData: FormData): Promise<never> {
  const user = await requireDeveloperSession();
  const entryId = readString(formData, 'id');
  let target: string;

  try {
    await deleteCatalogEntry({
      actorId: user.id,
      kind,
      entryId,
      meta: await actionMeta(),
    });
    revalidatePath(BASE_PATH[kind]);
    target = `${BASE_PATH[kind]}?deleted=1`;
  } catch (error) {
    target = errorRedirect(BASE_PATH[kind], error, `action:${kind}:delete`);
  }

  redirect(target);
}

async function submitEntry(kind: CatalogKind, formData: FormData): Promise<never> {
  const user = await requireDeveloperSession();
  const slug = readString(formData, 'slug');
  let target: string;

  try {
    await enforceContentRateLimit(user.id);
    await submitCatalogEntry({
      actorId: user.id,
      kind,
      entryId: readString(formData, 'id'),
      meta: await actionMeta(),
    });
    revalidatePath(BASE_PATH[kind]);
    target = `${BASE_PATH[kind]}/${slug}?submitted=1`;
  } catch (error) {
    target = errorRedirect(`${BASE_PATH[kind]}/${slug}`, error, `action:${kind}:submit`);
  }

  redirect(target);
}

async function withdrawEntry(kind: CatalogKind, formData: FormData): Promise<never> {
  const user = await requireDeveloperSession();
  const slug = readString(formData, 'slug');
  let target: string;

  try {
    await withdrawCatalogEntry({
      actorId: user.id,
      kind,
      entryId: readString(formData, 'id'),
      meta: await actionMeta(),
    });
    revalidatePath(BASE_PATH[kind]);
    target = `${BASE_PATH[kind]}/${slug}?withdrawn=1`;
  } catch (error) {
    target = errorRedirect(`${BASE_PATH[kind]}/${slug}`, error, `action:${kind}:withdraw`);
  }

  redirect(target);
}

async function createVersion(kind: CatalogKind, formData: FormData): Promise<never> {
  const user = await requireDeveloperSession();
  const slug = readString(formData, 'slug');
  let target: string;

  try {
    await enforceContentRateLimit(user.id);
    const result = await addCatalogVersion({
      actorId: user.id,
      kind,
      entryId: readString(formData, 'id'),
      raw: parseVersion(formData),
      meta: await actionMeta(),
    });
    revalidatePath(BASE_PATH[kind]);
    target = `${BASE_PATH[kind]}/${slug}${
      result.requiresReReview ? '?version=1&resubmitted=1' : '?version=1'
    }`;
  } catch (error) {
    target = errorRedirect(
      `${BASE_PATH[kind]}/${slug}/versions/create`,
      error,
      `action:${kind}:version`,
    );
  }

  redirect(target);
}

export async function createPluginAction(formData: FormData): Promise<void> {
  await createEntry('PLUGIN', formData);
}

export async function updatePluginAction(formData: FormData): Promise<void> {
  await updateEntry('PLUGIN', formData);
}

export async function deletePluginAction(formData: FormData): Promise<void> {
  await removeEntry('PLUGIN', formData);
}

export async function submitPluginAction(formData: FormData): Promise<void> {
  await submitEntry('PLUGIN', formData);
}

export async function withdrawPluginAction(formData: FormData): Promise<void> {
  await withdrawEntry('PLUGIN', formData);
}

export async function createPluginVersionAction(formData: FormData): Promise<void> {
  await createVersion('PLUGIN', formData);
}

export async function createThemeAction(formData: FormData): Promise<void> {
  await createEntry('THEME', formData);
}

export async function updateThemeAction(formData: FormData): Promise<void> {
  await updateEntry('THEME', formData);
}

export async function deleteThemeAction(formData: FormData): Promise<void> {
  await removeEntry('THEME', formData);
}

export async function submitThemeAction(formData: FormData): Promise<void> {
  await submitEntry('THEME', formData);
}

export async function withdrawThemeAction(formData: FormData): Promise<void> {
  await withdrawEntry('THEME', formData);
}

export async function createThemeVersionAction(formData: FormData): Promise<void> {
  await createVersion('THEME', formData);
}
