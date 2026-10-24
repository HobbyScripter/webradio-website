import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import { BookIcon, SearchIcon } from '@/components/ui/icons';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Benutzer registriert',
  USER_LOGIN: 'Benutzer angemeldet',
  ADMIN_ROLE_CHANGED: 'Rolle geändert',
  PLUGIN_CREATED: 'Plugin erstellt',
  PLUGIN_UPDATED: 'Plugin aktualisiert',
  PLUGIN_DELETED: 'Plugin gelöscht',
  PLUGIN_SUBMITTED: 'Plugin eingereicht',
  PLUGIN_WITHDRAWN: 'Plugin zurückgezogen',
  PLUGIN_RESUBMITTED_FOR_REVIEW: 'Plugin erneut eingereicht',
  PLUGIN_VERSION_CREATED: 'Plugin-Version erstellt',
  THEME_CREATED: 'Theme erstellt',
  THEME_UPDATED: 'Theme aktualisiert',
  THEME_DELETED: 'Theme gelöscht',
  THEME_SUBMITTED: 'Theme eingereicht',
  THEME_WITHDRAWN: 'Theme zurückgezogen',
  THEME_RESUBMITTED_FOR_REVIEW: 'Theme erneut eingereicht',
  THEME_VERSION_CREATED: 'Theme-Version erstellt',
  DEVELOPER_PROFILE_CREATED: 'Entwicklerprofil erstellt',
  DEVELOPER_PROFILE_UPDATED: 'Entwicklerprofil aktualisiert',
  DEVELOPER_PROFILE_DELETED: 'Entwicklerprofil gelöscht',
  PROFILE_UPDATED: 'Profil aktualisiert',
  PASSWORD_CHANGED: 'Passwort geändert',
  SESSION_REVOKED: 'Sitzung widerrufen',
  NEWS_CREATED: 'News erstellt',
  NEWS_UPDATED: 'News aktualisiert',
  NEWS_DELETED: 'News gelöscht',
  NEWS_PUBLISHED: 'News veröffentlicht',
  NEWS_UNPUBLISHED: 'News zurückgezogen',
  PUBLICATION_APPROVED: 'Veröffentlichung genehmigt',
  PUBLICATION_REJECTED: 'Veröffentlichung abgelehnt',
  PUBLICATION_CHANGES_REQUESTED: 'Änderungen angefordert',
};

async function AuditContent({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; action?: string; userId?: string; page?: string }>;
}) {
  await requireAdminSession();
  const query = await searchParams;
  const search = (query.search ?? '').toLowerCase();
  const actionFilter = query.action ?? '';
  const userFilter = query.userId ?? '';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const limit = 20;

  const allLogs = await db.orm.public.AuditLog.orderBy((log) => log.createdAt.desc()).all();

  const filtered = allLogs
    .filter((log) => (actionFilter ? log.action === actionFilter : true))
    .filter((log) => (userFilter ? log.userId === userFilter : true))
    .filter((log) =>
      search ? (log.details ?? '').toLowerCase().includes(search) : true,
    );

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const logs = filtered.slice((page - 1) * limit, page * limit);

  const uniqueActions = [...new Set(allLogs.map((log) => log.action))].sort();
  const uniqueUsers = [
    ...new Set(allLogs.map((log) => log.userId).filter((id): id is string => Boolean(id))),
  ].sort();

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (actionFilter) params.set('action', actionFilter);
    if (userFilter) params.set('userId', userFilter);
    if (nextPage > 1) params.set('page', String(nextPage));
    const suffix = params.toString();
    return suffix ? `/admin/audit?${suffix}` : '/admin/audit';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <BookIcon className="h-6 w-6" />
          Audit-Protokoll
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Administrative und sicherheitsrelevante Aktionen. Einträge sind hier ausschließlich
          lesbar und können nicht über die Oberfläche verändert oder gelöscht werden.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-white">{allLogs.length}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Einträge gesamt</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-violet-400">{uniqueActions.length}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Aktionstypen</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-rose-400">{filtered.length}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Gefilterte Einträge</div>
        </div>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-4" role="search">
        <div className="relative sm:col-span-2">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <label htmlFor="audit-search" className="sr-only">
            In Details suchen
          </label>
          <input
            id="audit-search"
            type="search"
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Suche in Details..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 py-2.5 pl-10 pr-4 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>

        <div>
          <label htmlFor="audit-action" className="sr-only">
            Aktion
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={actionFilter}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <option value="">Alle Aktionen</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action] || action}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-user" className="sr-only">
            Akteur
          </label>
          <select
            id="audit-user"
            name="userId"
            defaultValue={userFilter}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <option value="">Alle Akteure</option>
            {uniqueUsers.map((userId) => (
              <option key={userId} value={userId}>
                {userId.substring(0, 8)}…
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            Filter anwenden
          </button>
        </div>
      </form>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-600/10 text-rose-400">
            <BookIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-white">Keine Audit-Einträge gefunden</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Keine Einträge entsprechen den Filterkriterien.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Audit-Einträge</caption>
            <thead className="border-b border-zinc-800">
              <tr>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktion
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Akteur
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Zeitpunkt
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-medium text-white">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="px-4 py-3">
                    {log.userId ? (
                      <Link
                        href={`/admin/users/${log.userId}`}
                        className="font-mono text-xs text-violet-400 hover:text-violet-300"
                      >
                        {log.userId.substring(0, 8)}…
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-zinc-500">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-300">
                    {formatDateTime(log.createdAt) ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[28rem] truncate text-xs text-zinc-400" title={log.details ?? undefined}>
                      {log.details ?? '—'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Seitennavigation" className="flex items-center justify-between pt-2">
          <p className="text-sm text-zinc-500">
            Seite {page} von {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <ButtonLink href={buildHref(page - 1)} size="sm" variant="secondary">
                Zurück
              </ButtonLink>
            ) : null}
            {page < totalPages ? (
              <ButtonLink href={buildHref(page + 1)} size="sm" variant="secondary">
                Weiter
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export default function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; action?: string; userId?: string; page?: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-zinc-500">Audit-Protokoll wird geladen...</div>}
    >
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}
