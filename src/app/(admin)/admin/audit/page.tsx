import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import {
  BookIcon,
  SearchIcon,
  FilterIcon,
  ArrowLeftIcon,
} from '@/components/ui/icons';

const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Benutzer registriert',
  USER_LOGIN: 'Benutzer angemeldet',
  ADMIN_ROLE_CHANGED: 'Rolle geändert',
  PLUGIN_CREATED: 'Plugin erstellt',
  PLUGIN_UPDATED: 'Plugin aktualisiert',
  PLUGIN_DELETED: 'Plugin gelöscht',
  THEME_CREATED: 'Theme erstellt',
  THEME_UPDATED: 'Theme aktualisiert',
  THEME_DELETED: 'Theme gelöscht',
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
  NEWS_UNPUBLISHED: 'News zurückgegeben',
  PUBLICATION_REVIEW_CREATED: 'Moderation erstellt',
  PUBLICATION_APPROVED: 'Veröffentlichung genehmigt',
  PUBLICATION_REJECTED: 'Veröffentlichung abgelehnt',
};

async function AuditContent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await requireAdminSession();

  // Get filter parameters
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const actionFilter = typeof searchParams.action === 'string' ? searchParams.action : '';
  const userFilter = typeof searchParams.userId === 'string' ? searchParams.userId : '';
  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page) : 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  // Build query
  let query = db.orm.public.AuditLog.orderBy((log) => log.createdAt.desc());

  // Apply filters
  if (search) {
    query = query.where((log) => log.details.ilike(`%${search}%`));
  }

  if (actionFilter) {
    query = query.where({ action: actionFilter });
  }

  if (userFilter) {
    query = query.where({ userId: userFilter });
  }

  // Get logs and total count
  const [logs, total] = await Promise.all([
    query.limit(limit).offset(offset).all(),
    db.orm.public.AuditLog.all().then((all) => all.length),
  ]);

  // Get unique actions and users for filters
  const allLogs = await db.orm.public.AuditLog.all();
  const uniqueActions = [...new Set(allLogs.map((l) => l.action))].sort();
  const uniqueUsers = [
    ...new Set(allLogs.map((l) => l.userId).filter((id): id is string => Boolean(id))),
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Audit-Log</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Übersicht über alle administrativen Aktionen
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-sm text-zinc-400 font-medium">Gesamt</div>
          <div className="text-2xl font-bold text-white mt-1">{total}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-sm text-zinc-400 font-medium">Aktionen</div>
          <div className="text-2xl font-bold text-violet-400 mt-1">{uniqueActions.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-sm text-zinc-400 font-medium">Benutzer</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{uniqueUsers.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800">
        <h2 className="text-sm font-semibold text-white mb-4">Filter</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="search"
              placeholder="Suche in Details..."
              defaultValue={search}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition-colors"
            />
          </div>
          <select
            defaultValue={actionFilter}
            className="px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition-colors"
          >
            <option value="">Alle Aktionen</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action] || action}
              </option>
            ))}
          </select>
          <select
            defaultValue={userFilter}
            className="px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition-colors"
          >
            <option value="">Alle Benutzer</option>
            {uniqueUsers.map((userId) => (
              <option key={userId} value={userId}>
                {userId.substring(0, 8)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Log Table */}
      {logs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-600/10 text-rose-400 flex items-center justify-center mx-auto">
            <BookIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white mt-4">Keine Audit-Einträge gefunden</h3>
          <p className="text-zinc-400 text-sm mt-2">
            Keine Einträge entsprechen den Filterkriterien
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktion
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Benutzer
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Zeitpunkt
                </th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-white">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {log.userId ? (
                      <Link
                        href={`/admin/users/${log.userId}`}
                        className="text-sm text-violet-400 hover:text-violet-300 font-mono"
                      >
                        {log.userId.substring(0, 8)}...
                      </Link>
                    ) : (
                      <span className="text-sm text-zinc-500 font-mono">System</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-zinc-300">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-zinc-400 truncate max-w-[300px]">
                      {log.details || '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {Math.ceil(total / limit) > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-zinc-400">
            Seite {page} von {Math.ceil(total / limit)}
          </div>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <ButtonLink
                href={`/admin/audit?page=${page - 1}`}
                size="sm"
                variant="secondary"
              >
                Zurück
              </ButtonLink>
            )}
            {page < Math.ceil(total / limit) && (
              <ButtonLink
                href={`/admin/audit?page=${page + 1}`}
                size="sm"
                variant="secondary"
              >
                Weiter
              </ButtonLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Audit-Log wird geladen...
        </div>
      }
    >
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}
