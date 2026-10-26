'use server';

/**
 * Server actions for the admin dashboard.
 *
 * Every action resolves the administrator from the live database session and
 * delegates authorization/transactions to the service layer, which re-reads the
 * role and locks the affected rows. Client-side checks are convenience only.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/server-auth';
import { AuthError, changeUserRole, logServerError } from '@/lib/auth-service';
import { consumeRateLimitSafely } from '@/lib/rate-limit';
import { decideCatalogEntry } from '@/lib/developer-catalog-service';
import {
  createNews,
  deleteNews,
  setNewsPublished,
  updateNews,
} from '@/lib/news-service';
import { assignableRoleSchema, reviewResultSchema, reviewTargetSchema } from '@/lib/validations';
import { decideDeveloperApplication } from '@/lib/developer-application-service';
import {
  dismissReport,
  removeReportedContent,
  suspendReportedAccount,
  warnReportedAccount,
} from '@/lib/report-service';
import { liftSuspension, suspendAccount } from '@/lib/account-suspension';
import { removeCatalogEntry } from '@/lib/catalog-moderation-service';

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function meta() {
  const headerBag = await headers();
  return { userAgent: headerBag.get('user-agent') ?? undefined };
}

async function enforceLimit(
  scope: 'moderationDecision' | 'contentWrite' | 'adminUserWrite',
  identifier: string,
): Promise<void> {
  const decision = await consumeRateLimitSafely({ scope, identifier });
  if (!decision.allowed) {
    throw new AuthError(
      'Zu viele Aktionen in kurzer Zeit. Bitte warte einen Moment.',
      429,
      'RATE_LIMITED',
    );
  }
}

function failure(path: string, error: unknown, scope: string): string {
  if (error instanceof AuthError) {
    return `${path}?error=${encodeURIComponent(error.message)}`;
  }
  logServerError(scope, error);
  return `${path}?error=${encodeURIComponent('Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.')}`;
}

export async function moderateAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const targetType = reviewTargetSchema.safeParse(readString(formData, 'targetType'));
  const targetId = readString(formData, 'targetId');
  const decision = reviewResultSchema.safeParse(readString(formData, 'decision'));
  const notes = readString(formData, 'notes').trim();
  const kind = targetType.success ? targetType.data : 'PLUGIN';
  const detailPath = `/admin/moderation/${kind}/${targetId}`;
  let target: string;

  try {
    if (!targetType.success || !decision.success || !targetId) {
      throw new AuthError('Ungültige Moderationsentscheidung.', 400, 'VALIDATION_ERROR');
    }

    await enforceLimit('moderationDecision', admin.id);

    await decideCatalogEntry({
      actorId: admin.id,
      kind: targetType.data,
      entryId: targetId,
      decision: decision.data,
      notes: notes || undefined,
      userAgent: (await meta()).userAgent,
    });

    revalidatePath('/admin/moderation');
    revalidatePath('/admin');
    revalidatePath('/plugins');
    revalidatePath('/themes');
    target = `/admin/moderation?decided=${encodeURIComponent(decision.data)}`;
  } catch (error) {
    target = failure(detailPath, error, 'action:admin:moderate');
  }

  redirect(target);
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const userId = readString(formData, 'userId');
  const role = assignableRoleSchema.safeParse(readString(formData, 'role'));
  const detailPath = `/admin/users/${userId}`;
  let target: string;

  try {
    if (!role.success || !userId) {
      throw new AuthError('Ungültige Rollenauswahl.', 400, 'VALIDATION_ERROR');
    }

    await enforceLimit('adminUserWrite', admin.id);

    await changeUserRole({
      actorId: admin.id,
      targetUserId: userId,
      newRole: role.data,
      userAgent: (await meta()).userAgent,
    });

    revalidatePath('/admin/users');
    revalidatePath(detailPath);
    target = `${detailPath}?roleChanged=1`;
  } catch (error) {
    target = failure(detailPath, error, 'action:admin:role');
  }

  redirect(target);
}

export async function createNewsAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  let target: string;

  try {
    await enforceLimit('contentWrite', admin.id);
    const created = await createNews({
      actorId: admin.id,
      raw: {
        slug: readString(formData, 'slug'),
        title: readString(formData, 'title'),
        summary: readString(formData, 'summary'),
        content: readString(formData, 'content'),
        isPublished: false,
      },
      meta: await meta(),
    });
    revalidatePath('/admin/news');
    target = `/admin/news/${created.slug}/edit?created=1`;
  } catch (error) {
    target = failure('/admin/news/create', error, 'action:admin:news:create');
  }

  redirect(target);
}

export async function updateNewsAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const newsId = readString(formData, 'id');
  const slug = readString(formData, 'slug');
  let target: string;

  try {
    await enforceLimit('contentWrite', admin.id);
    const updated = await updateNews({
      actorId: admin.id,
      newsId,
      raw: {
        slug,
        title: readString(formData, 'title'),
        summary: readString(formData, 'summary'),
        content: readString(formData, 'content'),
      },
      meta: await meta(),
    });
    revalidatePath('/admin/news');
    revalidatePath(`/news/${updated.slug}`);
    target = `/admin/news/${updated.slug}/edit?updated=1`;
  } catch (error) {
    target = failure(`/admin/news/${slug}/edit`, error, 'action:admin:news:update');
  }

  redirect(target);
}

export async function setNewsPublishedAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const newsId = readString(formData, 'id');
  const slug = readString(formData, 'slug');
  const published = readString(formData, 'published') === 'true';
  let target: string;

  try {
    await enforceLimit('contentWrite', admin.id);
    await setNewsPublished({ actorId: admin.id, newsId, published, meta: await meta() });
    revalidatePath('/admin/news');
    revalidatePath('/news');
    revalidatePath(`/news/${slug}`);
    target = `/admin/news/${slug}/edit?${published ? 'published' : 'unpublished'}=1`;
  } catch (error) {
    target = failure(`/admin/news/${slug}/edit`, error, 'action:admin:news:publish');
  }

  redirect(target);
}

export async function deleteNewsAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  let target: string;

  try {
    await deleteNews({
      actorId: admin.id,
      newsId: readString(formData, 'id'),
      meta: await meta(),
    });
    revalidatePath('/admin/news');
    revalidatePath('/news');
    target = '/admin/news?deleted=1';
  } catch (error) {
    target = failure('/admin/news', error, 'action:admin:news:delete');
  }

  redirect(target);
}

// ---------------------------------------------------------------------------
// Developer access applications
// ---------------------------------------------------------------------------

export async function decideDeveloperApplicationAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const applicationId = readString(formData, 'applicationId');
  const decision = readString(formData, 'decision');
  const notes = readString(formData, 'notes').trim();
  let target: string;

  try {
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new AuthError('Ungültige Entscheidung.', 400, 'VALIDATION_ERROR');
    }

    await enforceLimit('adminUserWrite', admin.id);

    await decideDeveloperApplication({
      actorId: admin.id,
      applicationId,
      decision,
      notes: notes || undefined,
      userAgent: (await meta()).userAgent,
    });

    revalidatePath('/admin/developer-applications');
    revalidatePath('/admin/users');
    revalidatePath('/account/developer');
    target = `/admin/developer-applications?decided=${encodeURIComponent(decision)}`;
  } catch (error) {
    target = failure('/admin/developer-applications', error, 'action:admin:developer-application');
  }

  redirect(target);
}

// ---------------------------------------------------------------------------
// Reports, takedowns and account suspensions
// ---------------------------------------------------------------------------

export async function reportDecisionAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const reportId = readString(formData, 'reportId');
  const decision = readString(formData, 'decision');
  const notes = readString(formData, 'notes').trim();
  const days = Number.parseInt(readString(formData, 'suspendDays'), 10);
  let target: string;

  const common = {
    actorId: admin.id,
    reportId,
    notes: notes || undefined,
    userAgent: (await meta()).userAgent,
  };

  try {
    await enforceLimit('moderationDecision', admin.id);

    switch (decision) {
      case 'DISMISS':
        await dismissReport(common);
        break;
      case 'REMOVE':
        await removeReportedContent(common);
        break;
      case 'WARN':
        await warnReportedAccount(common);
        break;
      case 'SUSPEND':
        await suspendReportedAccount({
          ...common,
          until:
            Number.isFinite(days) && days > 0
              ? Temporal.Now.instant().add({ hours: days * 24 })
              : null,
        });
        break;
      default:
        throw new AuthError('Ungültige Entscheidung.', 400, 'VALIDATION_ERROR');
    }

    revalidatePath('/admin/reports');
    revalidatePath('/plugins');
    revalidatePath('/themes');
    target = `/admin/reports?decided=${encodeURIComponent(decision)}`;
  } catch (error) {
    target = failure('/admin/reports', error, 'action:admin:report-decision');
  }

  redirect(target);
}

export async function removeCatalogEntryAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const kind = reviewTargetSchema.safeParse(readString(formData, 'kind'));
  const entryId = readString(formData, 'entryId');
  const notes = readString(formData, 'notes').trim();
  const detailPath = `/admin/moderation/${kind.success ? kind.data : 'PLUGIN'}/${entryId}`;
  let target: string;

  try {
    if (!kind.success || !entryId) {
      throw new AuthError('Ungültiges Ziel.', 400, 'VALIDATION_ERROR');
    }

    await enforceLimit('moderationDecision', admin.id);
    await removeCatalogEntry({
      actorId: admin.id,
      kind: kind.data,
      entryId,
      notes,
      userAgent: (await meta()).userAgent,
    });

    revalidatePath('/admin/moderation');
    revalidatePath('/plugins');
    revalidatePath('/themes');
    target = '/admin/moderation?removed=1';
  } catch (error) {
    target = failure(detailPath, error, 'action:admin:catalog-remove');
  }

  redirect(target);
}

export async function suspendAccountAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const userId = readString(formData, 'userId');
  const reason = readString(formData, 'reason').trim();
  const days = Number.parseInt(readString(formData, 'days'), 10);
  const detailPath = `/admin/users/${userId}`;
  let target: string;

  try {
    await enforceLimit('adminUserWrite', admin.id);
    await suspendAccount({
      actorId: admin.id,
      targetUserId: userId,
      reason,
      until:
        Number.isFinite(days) && days > 0
          ? Temporal.Now.instant().add({ hours: days * 24 })
          : null,
      userAgent: (await meta()).userAgent,
    });

    revalidatePath('/admin/users');
    revalidatePath(detailPath);
    target = `${detailPath}?suspended=1`;
  } catch (error) {
    target = failure(detailPath, error, 'action:admin:suspend-account');
  }

  redirect(target);
}

export async function liftSuspensionAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const userId = readString(formData, 'userId');
  const reason = readString(formData, 'reason').trim();
  const detailPath = `/admin/users/${userId}`;
  let target: string;

  try {
    await enforceLimit('adminUserWrite', admin.id);
    await liftSuspension({
      actorId: admin.id,
      targetUserId: userId,
      reason,
      userAgent: (await meta()).userAgent,
    });

    revalidatePath('/admin/users');
    revalidatePath(detailPath);
    target = `${detailPath}?lifted=1`;
  } catch (error) {
    target = failure(detailPath, error, 'action:admin:lift-suspension');
  }

  redirect(target);
}
