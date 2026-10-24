import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format';
import { ButtonLink, Button } from '@/components/ui/button';
import {
  PlugIcon,
  ArrowLeftIcon,
  PencilIcon,
  EyeIcon,
  DownloadIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  ArchiveIcon,
  TrashIcon,
  PlusIcon,
} from '@/components/ui/icons';

const PLUGIN_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'In Prüfung',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  ARCHIVED: 'Archiviert',
};

const PLUGIN_STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: 'text-amber-400',
  APPROVED: 'text-emerald-400',
  REJECTED: 'text-rose-400',
  ARCHIVED: 'text-zinc-400',
};

const PLUGIN_STATUS_BG: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-500/10 border border-amber-500/20',
  APPROVED: 'bg-emerald-500/10 border border-emerald-500/20',
  REJECTED: 'bg-rose-500/10 border border-rose-500/20',
  ARCHIVED: 'bg-zinc-500/10 border border-zinc-500/20',
};

export default async function PluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!profile) {
    redirect('/developer/profile/create');
  }

  // Get plugin by slug
  const plugin = await db.orm.public.Plugin.where({
    slug,
    developerId: profile.id,
  }).first();

  if (!plugin) {
    notFound();
  }

  // Get versions
  const versions = await db.orm.public.PluginVersion.where({
    pluginId: plugin.id,
  }).orderBy((v) => v.releasedAt.desc()).all();

  // Get screenshots
  const screenshots = await db.orm.public.PluginScreenshot.where({
    pluginId: plugin.id,
  }).orderBy((s) => s.order.asc()).all();

  // Get tags
  const tags = await db.orm.public.PluginTag.where({
    pluginId: plugin.id,
  }).all();

  // Get reviews
  const reviews = await db.orm.public.PublicationReview.where({
    targetType: 'PLUGIN',
    targetId: plugin.id,
  }).orderBy((r) => r.createdAt.desc()).all();

  async function deletePlugin() {
    'use server';

    const user = await requireDeveloperSession();

    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      redirect('/developer/profile/create');
    }

    const plugin = await db.orm.public.Plugin.where({
      slug,
      developerId: profile.id,
    }).first();

    if (!plugin) {
      notFound();
    }

    // Delete plugin and all related data
    await db.orm.public.Plugin.where({ id: plugin.id }).delete();

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'PLUGIN_DELETED',
        details: JSON.stringify({ pluginId: plugin.id, slug: plugin.slug }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    redirect('/developer/plugins');
  }

  // Download count is tracked on the plugin, not per version.
  const totalDownloads = plugin.downloads;
  const latestVersion = versions.find((v) => v.isLatest) || versions[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/developer/plugins"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <ButtonLink
            href={`/developer/plugins/${plugin.slug}/edit`}
            size="sm"
            variant="secondary"
            className="inline-flex items-center gap-2"
          >
            <PencilIcon className="h-4 w-4" />
            Bearbeiten
          </ButtonLink>
          <form action={deletePlugin}>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              className="inline-flex items-center gap-2"
            >
              <TrashIcon className="h-4 w-4" />
              Löschen
            </Button>
          </form>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <PlugIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{plugin.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${PLUGIN_STATUS_COLORS[plugin.status]} ${PLUGIN_STATUS_BG[plugin.status]}`}>
                {PLUGIN_STATUS_LABELS[plugin.status] || plugin.status}
              </span>
              <span className="text-sm text-zinc-400">
                {plugin.isPublished ? 'Veröffentlicht' : 'Nicht veröffentlicht'}
              </span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Slug</div>
            <code className="text-sm text-zinc-300 mt-0.5 font-mono">{plugin.slug}</code>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Downloads</div>
            <div className="text-sm text-emerald-400 font-bold mt-0.5">{totalDownloads}</div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Erstellt</div>
            <div className="text-sm text-zinc-300 mt-0.5">
              {formatDate(plugin.createdAt)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Aktualisiert</div>
            <div className="text-sm text-zinc-300 mt-0.5">
              {formatDate(plugin.updatedAt)}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-6 p-6 rounded-xl bg-zinc-900/40 border border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Beschreibung</h2>
          <p className="text-zinc-300">{plugin.description}</p>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-400 mb-2">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
                >
                  {tag.tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Versions */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Versionen</h2>
            <ButtonLink
              href={`/developer/plugins/${plugin.slug}/versions/create`}
              size="sm"
              variant="secondary"
              className="inline-flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Neue Version
            </ButtonLink>
          </div>

          {versions.length === 0 ? (
            <div className="p-6 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
              <p className="text-zinc-400 text-sm">
                Keine Versionen vorhanden. Erstelle deine erste Version.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <table className="w-full text-left">
                <thead className="border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Version
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Beschreibung
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Veröffentlicht
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Dateigröße
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {versions.map((version) => (
                    <tr key={version.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-white">
                          {version.version}
                        </div>
                        <span className="text-xs text-zinc-500">
                          {version.isLatest && 'Aktuell'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-300 truncate max-w-[200px]">
                          {version.description || 'Keine Beschreibung'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-zinc-300">
                          {formatDate(version.releasedAt)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-zinc-300">
                          {formatFileSize(version.fileSize) ?? '–'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/developer/plugins/${plugin.slug}/versions/${version.version}/edit`}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Bearbeiten"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Screenshots */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Screenshots</h2>
            <ButtonLink
              href={`/developer/plugins/${plugin.slug}/screenshots/create`}
              size="sm"
              variant="secondary"
              className="inline-flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Screenshot hinzufügen
            </ButtonLink>
          </div>

          {screenshots.length === 0 ? (
            <div className="p-6 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
              <p className="text-zinc-400 text-sm">
                Keine Screenshots vorhanden. Füge Screenshots hinzu, um dein Plugin ansprechender zu gestalten.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {screenshots.map((screenshot) => (
                <div
                  key={screenshot.id}
                  className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800"
                >
                  <div className="relative">
                    <img
                      src={screenshot.url}
                      alt={screenshot.caption || `Screenshot ${screenshot.order}`}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <span className="absolute top-2 left-2 px-2 py-1 rounded-lg text-xs font-mono bg-black/50 text-white">
                      #{screenshot.order}
                    </span>
                  </div>
                  {screenshot.caption && (
                    <div className="mt-2 text-sm text-zinc-400">{screenshot.caption}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reviews */}
        {reviews.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Moderationsfeedback
            </h2>
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      review.status === 'APPROVED' 
                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                        : review.status === 'REJECTED'
                        ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                        : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                    }`}>
                      {review.status}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatDateTime(review.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-300">
                    {review.notes || 'Keine Notizen hinterlegt'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
