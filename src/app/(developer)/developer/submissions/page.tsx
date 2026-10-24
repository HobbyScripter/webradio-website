import Link from 'next/link';
import { Suspense } from 'react';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { ButtonLink } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import {
  CalendarIcon,
  PlugIcon,
  PaletteIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  EyeIcon,
  PencilIcon,
} from '@/components/ui/icons';

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  PENDING_REVIEW: 'In Prüfung',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  CHANGES_REQUESTED: 'Änderungen angefordert',
  ARCHIVED: 'Archiviert',
};

const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-zinc-400',
  PENDING_REVIEW: 'text-amber-400',
  APPROVED: 'text-emerald-400',
  REJECTED: 'text-rose-400',
  CHANGES_REQUESTED: 'text-amber-400',
  ARCHIVED: 'text-zinc-400',
};

const SUBMISSION_STATUS_BG: Record<string, string> = {
  DRAFT: 'bg-zinc-800 border border-zinc-700',
  PENDING_REVIEW: 'bg-amber-500/10 border border-amber-500/20',
  APPROVED: 'bg-emerald-500/10 border border-emerald-500/20',
  REJECTED: 'bg-rose-500/10 border border-rose-500/20',
  CHANGES_REQUESTED: 'bg-amber-500/10 border border-amber-500/20',
  ARCHIVED: 'bg-zinc-500/10 border border-zinc-500/20',
};

async function SubmissionsContent() {
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">
          Erstelle ein Entwicklerprofil, um Einreichungen zu verwalten
        </p>
        <ButtonLink href="/developer/profile/create" className="mt-4">
          Entwicklerprofil erstellen
        </ButtonLink>
      </div>
    );
  }

  // Get all plugins and themes by this developer
  const [plugins, themes] = await Promise.all([
    db.orm.public.Plugin.where({ developerId: profile.id }).all(),
    db.orm.public.Theme.where({ developerId: profile.id }).all(),
  ]);

  // Get all reviews for plugins and themes
  const pluginReviews = await Promise.all(
    plugins.map(async (plugin) => {
      const reviews = await db.orm.public.PublicationReview.where({
        targetType: 'PLUGIN',
        targetId: plugin.id,
      }).orderBy((r) => r.createdAt.desc()).all();
      return { plugin, reviews };
    })
  );

  const themeReviews = await Promise.all(
    themes.map(async (theme) => {
      const reviews = await db.orm.public.PublicationReview.where({
        targetType: 'THEME',
        targetId: theme.id,
      }).orderBy((r) => r.createdAt.desc()).all();
      return { theme, reviews };
    })
  );

  // Combine all submissions
  const submissions = [
    ...pluginReviews.flatMap(({ plugin, reviews }) => 
      reviews.map((review) => ({ type: 'PLUGIN' as const, plugin, review }))
    ),
    ...themeReviews.flatMap(({ theme, reviews }) => 
      reviews.map((review) => ({ type: 'THEME' as const, theme, review }))
    ),
  ].sort(
    (a, b) =>
      Number(b.review.createdAt.epochMilliseconds) - Number(a.review.createdAt.epochMilliseconds),
  );

  // Get latest submission for each plugin/theme
  const latestSubmissions = [
    ...plugins.map((plugin) => ({
      type: 'PLUGIN' as const,
      id: plugin.id,
      name: plugin.name,
      slug: plugin.slug,
      status: plugin.status,
      isPublished: plugin.isPublished,
      createdAt: plugin.createdAt,
      updatedAt: plugin.updatedAt,
    })),
    ...themes.map((theme) => ({
      type: 'THEME' as const,
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      status: theme.status,
      isPublished: theme.isPublished,
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    })),
  ].sort((a, b) => Number(b.updatedAt.epochMilliseconds) - Number(a.updatedAt.epochMilliseconds));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Meine Einreichungen
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Übersicht über alle deine Einreichungen
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400">
              <CalendarIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Einreichungen gesamt</div>
            <div className="text-2xl font-bold text-white mt-1">{latestSubmissions.length}</div>
            <div className="text-xs text-zinc-500 mt-1">
              {plugins.length} Plugins • {themes.length} Themes
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
              <ClockIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">In Prüfung</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {latestSubmissions.filter((s) => s.status === 'PENDING_REVIEW').length}
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Genehmigt</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {latestSubmissions.filter((s) => s.status === 'APPROVED').length}
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
              <AlertIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Überarbeitung nötig</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {
                latestSubmissions.filter(
                  (s) => s.status === 'REJECTED' || s.status === 'CHANGES_REQUESTED',
                ).length
              }
            </div>
          </div>
        </div>
      </div>

      {/* Latest Submissions */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Letzte Einreichungen
        </h2>
        
        {latestSubmissions.length === 0 ? (
          <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
            <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white mt-4">Noch keine Einreichungen</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Du hast noch keine Plugins oder Themes eingereicht.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
              <ButtonLink
                href="/developer/plugins/create"
                size="sm"
              >
                <PlugIcon className="h-4 w-4" />
                Plugin erstellen
              </ButtonLink>
              <ButtonLink
                href="/developer/themes/create"
                size="sm"
              >
                <PaletteIcon className="h-4 w-4" />
                Theme erstellen
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <table className="w-full text-left">
              <thead className="border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Typ
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Name
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Aktualisiert
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {latestSubmissions.map((submission) => (
                  <tr key={`${submission.type}-${submission.id}`} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        submission.type === 'PLUGIN' 
                          ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                          : 'bg-palette-500/10 text-palette-400 border border-palette-500/20'
                      }`}>
                        {submission.type === 'PLUGIN' ? 'Plugin' : 'Theme'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-white">{submission.name}</div>
                      <code className="text-xs text-zinc-500 font-mono">{submission.slug}</code>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${SUBMISSION_STATUS_COLORS[submission.status]} ${SUBMISSION_STATUS_BG[submission.status]}`}>
                        {SUBMISSION_STATUS_LABELS[submission.status] || submission.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-zinc-300">
                        {formatDateTime(submission.updatedAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {submission.status === 'APPROVED' && submission.isPublished ? (
                          <Link
                            href={`/${submission.type.toLowerCase()}s/${submission.slug}`}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Öffentliche Seite ansehen"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                        ) : (
                          <Link
                            href={`/developer/${submission.type.toLowerCase()}s/${submission.slug}`}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Details ansehen"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                        )}
                        <Link
                          href={`/developer/${submission.type.toLowerCase()}s/${submission.slug}/edit`}
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

      {/* Moderation Feedback */}
      {submissions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Moderationsfeedback
          </h2>
          <div className="space-y-4">
            {submissions.map((submission) => (
              <div
                key={`${submission.type}-${submission.review.id}`}
                className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    SUBMISSION_STATUS_COLORS[submission.review.status]
                  } ${SUBMISSION_STATUS_BG[submission.review.status]}`}>
                    {SUBMISSION_STATUS_LABELS[submission.review.status] || submission.review.status}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(submission.review.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-zinc-300">
                  {submission.review.notes || 'Keine Notizen hinterlegt'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Einreichungen werden geladen...
        </div>
      }
    >
      <SubmissionsContent />
    </Suspense>
  );
}
