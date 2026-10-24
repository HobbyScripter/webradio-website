import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/format';
import CatalogEntryDetail from '@/components/dashboard/CatalogEntryDetail';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

export default async function ThemeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    created?: string;
    draft?: string;
    submitted?: string;
    withdrawn?: string;
    version?: string;
    resubmitted?: string;
    error?: string;
  }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await requireDeveloperSession();

  const profile = await db.orm.public.DeveloperProfile.where({ userId: user.id }).first();
  if (!profile) {
    redirect('/developer/profile/create');
  }

  const theme = await db.orm.public.Theme.where({
    slug,
    developerId: profile.id,
  }).first();

  if (!theme) {
    notFound();
  }

  const [versions, tags, reviews, screenshots] = await Promise.all([
    db.orm.public.ThemeVersion.where({ themeId: theme.id })
      .orderBy((version) => version.releasedAt.desc())
      .all(),
    db.orm.public.ThemeTag.where({ themeId: theme.id }).all(),
    db.orm.public.PublicationReview.where({ targetType: 'THEME', targetId: theme.id })
      .orderBy((review) => review.createdAt.desc())
      .all(),
    db.orm.public.ThemeScreenshot.where({ themeId: theme.id }).all(),
  ]);

  let notice: { message: string; tone: 'success' | 'info' | 'error' } | null = null;
  if (query.created || query.submitted) {
    notice = { message: 'Theme wurde zur Moderation eingereicht.', tone: 'success' };
  } else if (query.draft) {
    notice = { message: 'Theme wurde als Entwurf gespeichert.', tone: 'info' };
  } else if (query.withdrawn) {
    notice = {
      message: 'Einreichung zurückgezogen. Der Eintrag ist wieder ein Entwurf.',
      tone: 'info',
    };
  } else if (query.version) {
    notice = query.resubmitted
      ? {
          message:
            'Version gespeichert. Der genehmigte Eintrag wurde aus dem Katalog genommen und erneut zur Moderation eingereicht.',
          tone: 'info',
        }
      : { message: 'Version gespeichert.', tone: 'success' };
  }

  return (
    <CatalogEntryDetail
      kind="THEME"
      entry={{
        id: theme.id,
        slug: theme.slug,
        name: theme.name,
        description: theme.description,
        status: theme.status,
        isPublished: theme.isPublished,
        downloads: theme.downloads,
        createdAt: formatDate(theme.createdAt) ?? '—',
        updatedAt: formatDate(theme.updatedAt) ?? '—',
      }}
      versions={versions.map((version) => ({
        id: version.id,
        version: version.version,
        description: version.description,
        releasedAt: formatDate(version.releasedAt) ?? '—',
        fileSize: version.fileSize,
        isLatest: version.isLatest,
      }))}
      tags={tags.map((tag) => tag.tag)}
      reviews={reviews.map((review) => ({
        id: review.id,
        status: review.status,
        notes: review.notes,
        createdAt: formatDateTime(review.createdAt) ?? '—',
      }))}
      screenshotCount={screenshots.length}
      notice={notice}
      error={query.error ?? null}
    />
  );
}
