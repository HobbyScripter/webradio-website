import Link from 'next/link';
import { Suspense } from 'react';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { ButtonLink } from '@/components/ui/button';
import {
  PaletteIcon,
  PlusIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  ArchiveIcon,
  PencilIcon,
  EyeIcon,
  SearchIcon,
} from '@/components/ui/icons';

const THEME_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'In Prüfung',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  ARCHIVED: 'Archiviert',
};

const THEME_STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: 'text-amber-400',
  APPROVED: 'text-emerald-400',
  REJECTED: 'text-rose-400',
  ARCHIVED: 'text-zinc-400',
};

const THEME_STATUS_BG: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-500/10 border border-amber-500/20',
  APPROVED: 'bg-emerald-500/10 border border-emerald-500/20',
  REJECTED: 'bg-rose-500/10 border border-rose-500/20',
  ARCHIVED: 'bg-zinc-500/10 border border-zinc-500/20',
};

async function ThemeContent({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">
          Erstelle ein Entwicklerprofil, um Themes zu verwalten
        </p>
        <ButtonLink href="/developer/profile/create" className="mt-4">
          Entwicklerprofil erstellen
        </ButtonLink>
      </div>
    );
  }

  // Get search and filter parameters
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const statusFilter = typeof searchParams.status === 'string' ? searchParams.status : '';

  // Get all themes by this developer
  let themes = await db.orm.public.Theme.where({ developerId: profile.id }).all();

  // Filter by search
  if (search) {
    themes = themes.filter(
      (t) => 
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase()) ||
        (t.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
  }

  // Filter by status
  if (statusFilter) {
    themes = themes.filter((t) => t.status === statusFilter);
  }

  // Get versions for each theme
  const themesWithVersions = await Promise.all(
    themes.map(async (theme) => {
      const versions = await db.orm.public.ThemeVersion.where({
        themeId: theme.id,
      }).orderBy((v) => v.releasedAt.desc()).all();
      
      const reviews = await db.orm.public.PublicationReview.where({
        targetType: 'THEME',
        targetId: theme.id,
      }).orderBy((r) => r.createdAt.desc()).all();

      return {
        ...theme,
        versions,
        reviews,
      };
    })
  );

  const totalThemes = themesWithVersions.length;
  const publishedThemes = themesWithVersions.filter((t) => t.isPublished && t.status === 'APPROVED').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Meine Themes</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Verwalte deine Theme-Erweiterungen
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ButtonLink
            href="/developer/themes/create"
            size="sm"
            className="inline-flex items-center gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            Neues Theme
          </ButtonLink>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-palette-500/10 text-palette-400">
              <PaletteIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Themes gesamt</div>
            <div className="text-2xl font-bold text-white mt-1">{totalThemes}</div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Veröffentlicht</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{publishedThemes}</div>
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
              {themesWithVersions.filter((t) => t.status === 'PENDING_REVIEW').length}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            placeholder="Suche nach Theme-Name..."
            defaultValue={search}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
          />
        </div>
        <select
          defaultValue={statusFilter}
          className="px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
        >
          <option value="">Alle Status</option>
          <option value="PENDING_REVIEW">In Prüfung</option>
          <option value="APPROVED">Genehmigt</option>
          <option value="REJECTED">Abgelehnt</option>
          <option value="ARCHIVED">Archiviert</option>
        </select>
      </div>

      {/* Theme List */}
      {themesWithVersions.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
            <PaletteIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white mt-4">Noch keine Themes</h3>
          <p className="text-zinc-400 text-sm mt-2">
            Du hast noch keine Themes erstellt. Beginne mit deinem ersten Theme.
          </p>
          <div className="mt-4">
            <ButtonLink
              href="/developer/themes/create"
              size="sm"
            >
              <PlusIcon className="h-4 w-4" />
              Neues Theme erstellen
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Name
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Slug
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Downloads
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Versionen
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {themesWithVersions.map((theme) => (
                <tr key={theme.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <PaletteIcon className="h-4 w-4 text-zinc-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{theme.name}</div>
                        <div className="text-xs text-zinc-500 truncate max-w-[200px]">
                          {theme.description || 'Keine Beschreibung'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-xs text-zinc-400 font-mono">{theme.slug}</code>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${THEME_STATUS_COLORS[theme.status]} ${THEME_STATUS_BG[theme.status]}`}>
                      {THEME_STATUS_LABELS[theme.status] || theme.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-zinc-300">{theme.downloads}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-zinc-300">{theme.versions?.length || 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/developer/themes/${theme.slug}`}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Ansehen"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/developer/themes/${theme.slug}/edit`}
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
  );
}

export default function ThemesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Themes werden geladen...
        </div>
      }
    >
      <ThemeContent searchParams={searchParams} />
    </Suspense>
  );
}
