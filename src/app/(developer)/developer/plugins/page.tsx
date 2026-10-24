import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { pluginStatusSchema } from '@/lib/validations';
import { formatDate } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import CatalogStatusBadge from '@/components/dashboard/CatalogStatusBadge';
import {
  PlugIcon,
  PlusIcon,
  SearchIcon,
  EyeIcon,
  PencilIcon,
} from '@/components/ui/icons';

const FILTERS = [
  { key: '', label: 'Alle' },
  { key: 'DRAFT', label: 'Entwürfe' },
  { key: 'PENDING_REVIEW', label: 'In Prüfung' },
  { key: 'APPROVED', label: 'Genehmigt' },
  { key: 'CHANGES_REQUESTED', label: 'Änderungen angefordert' },
  { key: 'REJECTED', label: 'Abgelehnt' },
  { key: 'ARCHIVED', label: 'Archiviert' },
] as const;

async function PluginsContent({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; deleted?: string; error?: string }>;
}) {
  const user = await requireDeveloperSession();
  const query = await searchParams;
  const search = query.search ?? '';
  const status = query.status ?? '';

  const developerProfile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!developerProfile) {
    redirect('/developer/profile/create');
  }

  const allPlugins = await db.orm.public.Plugin.where({
    developerId: developerProfile.id,
  }).all();

  const statusFilter = pluginStatusSchema.safeParse(status);
  const plugins = allPlugins
    .filter((plugin) => (statusFilter.success ? plugin.status === statusFilter.data : true))
    .filter((plugin) =>
      search
        ? plugin.name.toLowerCase().includes(search.toLowerCase()) ||
          plugin.slug.toLowerCase().includes(search.toLowerCase())
        : true,
    )
    .sort(
      (a, b) =>
        Number(b.updatedAt.epochMilliseconds) - Number(a.updatedAt.epochMilliseconds),
    );

  const pluginsWithVersions = await Promise.all(
    plugins.map(async (plugin) => ({
      plugin,
      latestVersion: await db.orm.public.PluginVersion.where({
        pluginId: plugin.id,
        isLatest: true,
      }).first(),
    })),
  );

  const countFor = (key: string) =>
    key === '' ? allPlugins.length : allPlugins.filter((plugin) => plugin.status === key).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <PlugIcon className="h-6 w-6" />
            Meine Plugins
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
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

      {query.deleted ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200"
        >
          Plugin gelöscht.
        </p>
      ) : null}
      {query.error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
        >
          {query.error}
        </p>
      ) : null}

      <form method="get" className="flex flex-col gap-4 sm:flex-row sm:items-center" role="search">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <label htmlFor="plugin-search" className="sr-only">
            Plugins durchsuchen
          </label>
          <input
            id="plugin-search"
            type="search"
            name="search"
            placeholder="Suche nach Plugin-Name..."
            defaultValue={search}
            className="w-full rounded-xl border border-white/10 bg-[#07070a] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button
          type="submit"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          Suchen
        </button>
      </form>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((filter) => {
          const active = status === filter.key;
          return (
            <Link
              key={filter.key || 'all'}
              href={filter.key ? `/developer/plugins?status=${filter.key}` : '/developer/plugins'}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border border-violet-500/20 bg-violet-500/10 text-violet-300'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {filter.label} ({countFor(filter.key)})
            </Link>
          );
        })}
      </div>

      {pluginsWithVersions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/10 text-violet-400">
            <PlugIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-white">Keine Plugins gefunden</h2>
          <p className="mt-2 text-sm text-zinc-400">
            {search || status
              ? 'Keine Plugins passen zu den aktuellen Filterkriterien.'
              : 'Du hast noch keine Plugins erstellt.'}
          </p>
          <div className="mt-4">
            <ButtonLink href="/developer/plugins/create" size="sm">
              <PlusIcon className="h-4 w-4" />
              Erstes Plugin erstellen
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
          <table className="w-full text-sm">
            <caption className="sr-only">Deine Plugins mit Status und letzter Version</caption>
            <thead className="border-b border-zinc-800 bg-zinc-800/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Plugin
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Version
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Downloads
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktualisiert
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {pluginsWithVersions.map(({ plugin, latestVersion }) => (
                <tr key={plugin.id} className="transition-colors hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/developer/plugins/${plugin.slug}`} className="group flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 transition-colors group-hover:bg-violet-500/10 group-hover:text-violet-400">
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
                  <td className="px-4 py-3 text-zinc-300">{latestVersion?.version ?? '—'}</td>
                  <td className="px-4 py-3">
                    <CatalogStatusBadge status={plugin.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{plugin.downloads}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {formatDate(plugin.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/developer/plugins/${plugin.slug}`}
                        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        aria-label={`${plugin.name} ansehen`}
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/developer/plugins/${plugin.slug}/edit`}
                        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        aria-label={`${plugin.name} bearbeiten`}
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

export default function DeveloperPluginsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; deleted?: string; error?: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-zinc-500">Plugins werden geladen...</div>}
    >
      <PluginsContent searchParams={searchParams} />
    </Suspense>
  );
}
