import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { pluginStatusSchema } from '@/lib/validations';
import { ButtonLink, Button } from '@/components/ui/button';
import {
  PlugIcon,
  PlusIcon,
  SearchIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  ArchiveIcon,
} from '@/components/ui/icons';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING_REVIEW: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  APPROVED: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  REJECTED: { bg: 'bg-rose-500/10', text: 'text-rose-400' },
  ARCHIVED: { bg: 'bg-zinc-800', text: 'text-zinc-400' },
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'In Prüfung',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  ARCHIVED: 'Archiviert',
};

async function PluginsContent({ searchParams }: { searchParams: Promise<{ search?: string; status?: string }> }) {
  const user = await requireDeveloperSession();
  const { search = '', status = '' } = await searchParams;

  // Get developer profile
  const developerProfile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!developerProfile) {
    redirect('/developer/profile/create');
  }

  // Get plugins with filtering
  let pluginsQuery = db.orm.public.Plugin.where({
    developerId: developerProfile.id,
  });

  // Apply filters
  const statusFilter = pluginStatusSchema.safeParse(status);
  if (statusFilter.success) {
    pluginsQuery = pluginsQuery.where((p) => p.status.eq(statusFilter.data));
  }

  if (search) {
    pluginsQuery = pluginsQuery.where((p) =>
      p.name.ilike(`%${search}%`)
    );
  }

  const plugins = await pluginsQuery.orderBy((p) => p.updatedAt.desc()).all();

  // Get latest version for each plugin
  const pluginsWithVersions = await Promise.all(
    plugins.map(async (plugin) => {
      const latestVersion = await db.orm.public.PluginVersion.where({
        pluginId: plugin.id,
        isLatest: true,
      }).first();

      const review = await db.orm.public.PublicationReview.where({
        targetType: 'PLUGIN',
        targetId: plugin.id,
      }).orderBy((r) => r.createdAt.desc()).first();

      return {
        ...plugin,
        latestVersion,
        review,
        createdAt: plugin.createdAt.toString(),
        updatedAt: plugin.updatedAt.toString(),
      };
    })
  );

  // Get status counts
  const allPlugins = await db.orm.public.Plugin.where({
    developerId: developerProfile.id,
  }).all();

  const statusCounts: Record<string, number> = {
    all: allPlugins.length,
    PENDING_REVIEW: allPlugins.filter((p) => p.status === 'PENDING_REVIEW').length,
    APPROVED: allPlugins.filter((p) => p.status === 'APPROVED').length,
    REJECTED: allPlugins.filter((p) => p.status === 'REJECTED').length,
    ARCHIVED: allPlugins.filter((p) => p.status === 'ARCHIVED').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <PlugIcon className="h-6 w-6" />
            Meine Plugins
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Verwalte deine Plugins und deren Einreichungen
          </p>
        </div>
        <ButtonLink
          href="/developer/plugins/create"
          size="sm"
          className="inline-flex items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Neues Plugin
        </ButtonLink>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            placeholder="Suche nach Plugin-Name..."
            defaultValue={search}
            className="w-full rounded-xl border border-white/10 bg-[#07070a] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Link
            href="/developer/plugins"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === '' || status === 'all'
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Alle ({statusCounts.all})
          </Link>
          <Link
            href="/developer/plugins?status=PENDING_REVIEW"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'PENDING_REVIEW'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            In Prüfung ({statusCounts.PENDING_REVIEW})
          </Link>
          <Link
            href="/developer/plugins?status=APPROVED"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'APPROVED'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Genehmigt ({statusCounts.APPROVED})
          </Link>
          <Link
            href="/developer/plugins?status=REJECTED"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'REJECTED'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Abgelehnt ({statusCounts.REJECTED})
          </Link>
          <Link
            href="/developer/plugins?status=ARCHIVED"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'ARCHIVED'
                ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Archiviert ({statusCounts.ARCHIVED})
          </Link>
        </div>
      </div>

      {/* Plugins Table */}
      {pluginsWithVersions.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
            <PlugIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white mt-4">Keine Plugins gefunden</h3>
          <p className="text-zinc-400 text-sm mt-2">
            {search || status
              ? 'Keine Plugins passen zu den aktuellen Filterkriterien.'
              : 'Du hast noch keine Plugins erstellt.'}
          </p>
          <div className="mt-4">
            <ButtonLink
              href="/developer/plugins/create"
              size="sm"
            >
              <PlusIcon className="h-4 w-4" />
              Erstes Plugin erstellen
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50 border-b border-zinc-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Plugin
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Downloads
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktualisiert
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {pluginsWithVersions.map((plugin) => {
                const statusColor = STATUS_COLORS[plugin.status] || STATUS_COLORS.PENDING_REVIEW;
                const statusLabel = STATUS_LABELS[plugin.status] || plugin.status;

                return (
                  <tr key={plugin.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/developer/plugins/${plugin.slug}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 group-hover:bg-violet-500/10 group-hover:text-violet-400 transition-colors">
                          <PlugIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-white group-hover:text-violet-400">
                            {plugin.name}
                          </div>
                          <div className="text-xs text-zinc-500">{plugin.slug}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {plugin.latestVersion ? (
                        <span className="text-zinc-300">{plugin.latestVersion.version}</span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium ${statusColor.bg} ${statusColor.text}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-zinc-300">{plugin.downloads}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-500">
                        {new Date(plugin.updatedAt).toLocaleDateString('de-DE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/developer/plugins/${plugin.slug}`}
                          className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                          title="Ansehen"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/developer/plugins/${plugin.slug}/edit`}
                          className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                          title="Bearbeiten"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                        {plugin.status === 'PENDING_REVIEW' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1.5 text-amber-400 hover:bg-amber-500/5 hover:text-amber-300"
                            title="Zurückziehen"
                          >
                            <ArchiveIcon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DeveloperPluginsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Plugins werden geladen...
        </div>
      }
    >
      <PluginsContent searchParams={searchParams} />
    </Suspense>
  );
}
