import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/format';
import CatalogEntryDetail from '@/components/dashboard/CatalogEntryDetail';

export default async function PluginDetailPage({
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

  // Ownership is part of the query: a foreign slug is indistinguishable from a
  // missing one (404), so ids/slugs cannot be used to probe other developers.
  const plugin = await db.orm.public.Plugin.where({
    slug,
    developerId: profile.id,
  }).first();

  if (!plugin) {
    notFound();
  }

  const [versions, tags, reviews, screenshots] = await Promise.all([
    db.orm.public.PluginVersion.where({ pluginId: plugin.id })
      .orderBy((version) => version.releasedAt.desc())
      .all(),
    db.orm.public.PluginTag.where({ pluginId: plugin.id }).all(),
    db.orm.public.PublicationReview.where({ targetType: 'PLUGIN', targetId: plugin.id })
      .orderBy((review) => review.createdAt.desc())
      .all(),
    db.orm.public.PluginScreenshot.where({ pluginId: plugin.id }).all(),
  ]);

  let notice: { message: string; tone: 'success' | 'info' | 'error' } | null = null;
  if (query.created) {
    notice = { message: 'Plugin wurde zur Moderation eingereicht.', tone: 'success' };
  } else if (query.draft) {
    notice = { message: 'Plugin wurde als Entwurf gespeichert.', tone: 'info' };
  } else if (query.submitted) {
    notice = { message: 'Plugin wurde zur Moderation eingereicht.', tone: 'success' };
  } else if (query.withdrawn) {
    notice = { message: 'Einreichung zurückgezogen. Der Eintrag ist wieder ein Entwurf.', tone: 'info' };
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
      kind="PLUGIN"
      entry={{
        id: plugin.id,
        slug: plugin.slug,
        name: plugin.name,
        description: plugin.description,
        status: plugin.status,
        isPublished: plugin.isPublished,
        downloads: plugin.downloads,
        createdAt: formatDate(plugin.createdAt) ?? '—',
        updatedAt: formatDate(plugin.updatedAt) ?? '—',
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
