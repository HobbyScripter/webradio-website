import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import CatalogStatusBadge from '@/components/dashboard/CatalogStatusBadge';
import {
  PlugIcon,
  PaletteIcon,
  ClockIcon,
  CheckIcon,
  ArrowRightIcon,
  SearchIcon,
} from '@/components/ui/icons';

async function ModerationContent({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string; decided?: string; error?: string }>;
}) {
  await requireAdminSession();
  const query = await searchParams;
  const type = query.type === 'PLUGIN' || query.type === 'THEME' ? query.type : 'all';
  const search = (query.search ?? '').toLowerCase();

  const [plugins, themes, reviews, profiles] = await Promise.all([
    db.orm.public.Plugin.where({ status: 'PENDING_REVIEW' }).all(),
    db.orm.public.Theme.where({ status: 'PENDING_REVIEW' }).all(),
    db.orm.public.PublicationReview.orderBy((review) => review.createdAt.desc()).limit(25).all(),
    db.orm.public.DeveloperProfile.all(),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const pending = [
    ...plugins.map((plugin) => ({
      type: 'PLUGIN' as const,
      id: plugin.id,
      slug: plugin.slug,
      name: plugin.name,
      status: plugin.status,
      submittedAt: plugin.updatedAt,
      developer: profileById.get(plugin.developerId)?.displayName ?? 'Unbekannt',
    })),
    ...themes.map((theme) => ({
      type: 'THEME' as const,
      id: theme.id,
      slug: theme.slug,
      name: theme.name,
      status: theme.status,
      submittedAt: theme.updatedAt,
      developer: profileById.get(theme.developerId)?.displayName ?? 'Unbekannt',
    })),
  ]
    .filter((entry) => (type === 'all' ? true : entry.type === type))
    .filter((entry) =>
      search
        ? entry.name.toLowerCase().includes(search) ||
          entry.slug.toLowerCase().includes(search) ||
          entry.developer.toLowerCase().includes(search)
        : true,
    )
    .sort(
      (a, b) => Number(b.submittedAt.epochMilliseconds) - Number(a.submittedAt.epochMilliseconds),
    );

  // Labels for the recent decisions; ids that no longer resolve are shown as
  // deleted instead of being silently dropped.
  const pluginNames = new Map((await db.orm.public.Plugin.all()).map((p) => [p.id, p.name]));
  const themeNames = new Map((await db.orm.public.Theme.all()).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <ClockIcon className="h-6 w-6" />
          Moderation
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Offene Plugin- und Theme-Einreichungen prüfen und entscheiden.
        </p>
      </div>

      {query.decided ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          Entscheidung gespeichert ({query.decided}). Das Audit-Protokoll wurde aktualisiert.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {query.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-amber-400">{pending.length}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Offene Fälle (gefiltert)</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-white">
            {plugins.length + themes.length}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">Offen gesamt</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-emerald-400">
            {reviews.filter((review) => review.status === 'APPROVED').length}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">Genehmigungen (letzte 25)</div>
        </div>
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center" role="search">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <label htmlFor="moderation-search" className="sr-only">
            Einreichungen durchsuchen
          </label>
          <input
            id="moderation-search"
            type="search"
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Suche nach Name oder Entwickler..."
            className="w-full rounded-xl border border-white/10 bg-[#07070a] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <label htmlFor="moderation-type" className="sr-only">
          Typ
        </label>
        <select
          id="moderation-type"
          name="type"
          defaultValue={type}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          <option value="all">Alle Typen</option>
          <option value="PLUGIN">Plugins</option>
          <option value="THEME">Themes</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          Filtern
        </button>
      </form>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-400">
            <CheckIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-white">Keine offenen Einreichungen</h2>
          <p className="mt-2 text-sm text-zinc-400">
            {search || type !== 'all'
              ? 'Keine Einreichung passt zu den Filterkriterien.'
              : 'Die Moderationswarteschlange ist leer.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
          <table className="w-full text-sm">
            <caption className="sr-only">Offene Einreichungen</caption>
            <thead className="border-b border-zinc-800 bg-zinc-800/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Typ
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Einreichung
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Entwickler
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Eingereicht
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {pending.map((entry) => (
                <tr key={`${entry.type}-${entry.id}`} className="transition-colors hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-violet-400">
                      {entry.type === 'PLUGIN' ? (
                        <PlugIcon className="h-4 w-4" />
                      ) : (
                        <PaletteIcon className="h-4 w-4" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/moderation/${entry.type}/${entry.id}`}
                      className="group"
                    >
                      <div className="font-semibold text-white group-hover:text-violet-400">
                        {entry.name}
                      </div>
                      <div className="text-xs text-zinc-500">{entry.slug}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{entry.developer}</td>
                  <td className="px-4 py-3">
                    <CatalogStatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {formatDateTime(entry.submittedAt) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/moderation/${entry.type}/${entry.id}`}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/10 hover:text-violet-300"
                    >
                      Prüfen
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Letzte Entscheidungen</h2>
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
            Noch keine Moderationsentscheidungen vorhanden.
          </p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((review) => {
              const label =
                review.targetType === 'PLUGIN'
                  ? (pluginNames.get(review.targetId) ?? 'Gelöschtes Plugin')
                  : (themeNames.get(review.targetId) ?? 'Gelöschtes Theme');
              return (
                <li
                  key={review.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <CatalogStatusBadge status={review.status} />
                    <span className="text-sm font-medium text-white">{label}</span>
                    <span className="text-xs text-zinc-500">
                      {review.targetType === 'PLUGIN' ? 'Plugin' : 'Theme'} ·{' '}
                      {formatDateTime(review.createdAt) ?? '—'}
                    </span>
                  </div>
                  {review.notes ? (
                    <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{review.notes}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string; decided?: string; error?: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-zinc-500">Moderation wird geladen...</div>}
    >
      <ModerationContent searchParams={searchParams} />
    </Suspense>
  );
}
