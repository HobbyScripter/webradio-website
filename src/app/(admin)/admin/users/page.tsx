import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { roleSchema } from '@/lib/validations';
import { ROLE_LABELS } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import { SearchIcon, ShieldIcon, UserIcon, CheckIcon, AlertIcon, ChevronRightIcon } from '@/components/ui/icons';

const ROLE_CLASSES: Record<string, string> = {
  USER: 'bg-zinc-800 text-zinc-400',
  DEVELOPER: 'bg-violet-500/10 text-violet-400',
  ADMIN: 'bg-amber-500/10 text-amber-400',
  SYSTEM_ADMIN: 'bg-rose-500/10 text-rose-400',
};

const ROLE_TABS = ['USER', 'DEVELOPER', 'ADMIN', 'SYSTEM_ADMIN'] as const;

async function UsersContent({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; page?: string; roleChanged?: string; error?: string }>;
}) {
  const admin = await requireAdminSession();
  const query = await searchParams;
  const search = (query.search ?? '').toLowerCase();
  const role = query.role ?? '';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const perPage = 20;

  const everyone = await db.orm.public.User.all();
  const roleFilter = roleSchema.safeParse(role);

  const filtered = everyone
    .filter((user) => (roleFilter.success ? user.role === roleFilter.data : true))
    .filter((user) =>
      search
        ? user.email.toLowerCase().includes(search) ||
          (user.name ?? '').toLowerCase().includes(search)
        : true,
    )
    .sort(
      (a, b) =>
        Number(b.createdAt.epochMilliseconds) - Number(a.createdAt.epochMilliseconds),
    );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageUsers = filtered.slice((page - 1) * perPage, page * perPage);

  const withProfiles = await Promise.all(
    pageUsers.map(async (user) => {
      const profile = await db.orm.public.DeveloperProfile.where({ userId: user.id }).first();
      const pluginsCount = profile
        ? (await db.orm.public.Plugin.where({ developerId: profile.id }).all()).length
        : 0;
      const themesCount = profile
        ? (await db.orm.public.Theme.where({ developerId: profile.id }).all()).length
        : 0;
      return { user, pluginsCount, themesCount };
    }),
  );

  const countFor = (roleKey: string) =>
    roleKey === '' ? everyone.length : everyone.filter((user) => user.role === roleKey).length;

  const buildHref = (nextPage: number, nextRole = role) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (nextRole) params.set('role', nextRole);
    if (nextPage > 1) params.set('page', String(nextPage));
    const suffix = params.toString();
    return suffix ? `/admin/users?${suffix}` : '/admin/users';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <UserIcon className="h-6 w-6" />
          Benutzerverwaltung
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Konten suchen, Verifizierungsstatus einsehen und zulässige Rollen ändern.
        </p>
      </div>

      {query.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {query.error}
        </p>
      ) : null}
      {query.roleChanged ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          Rolle geändert und auditiert.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-white">{everyone.length}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Konten gesamt</div>
        </div>
        {ROLE_TABS.map((roleKey) => (
          <div key={roleKey} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
            <div className="text-lg font-bold text-zinc-200">{countFor(roleKey)}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{ROLE_LABELS[roleKey]}</div>
          </div>
        ))}
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center" role="search">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <label htmlFor="user-search" className="sr-only">
            Benutzer durchsuchen
          </label>
          <input
            id="user-search"
            type="search"
            name="search"
            defaultValue={query.search ?? ''}
            placeholder="Suche nach E-Mail oder Name..."
            className="w-full rounded-xl border border-white/10 bg-[#07070a] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        {role ? <input type="hidden" name="role" value={role} /> : null}
        <button
          type="submit"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          Suchen
        </button>
      </form>

      <div className="flex flex-wrap gap-1">
        <Link
          href="/admin/users"
          aria-current={role === '' ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            role === ''
              ? 'border border-violet-500/20 bg-violet-500/10 text-violet-300'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          Alle ({everyone.length})
        </Link>
        {ROLE_TABS.map((roleKey) => (
          <Link
            key={roleKey}
            href={`/admin/users?role=${roleKey}`}
            aria-current={role === roleKey ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              role === roleKey
                ? 'border border-violet-500/20 bg-violet-500/10 text-violet-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {ROLE_LABELS[roleKey]} ({countFor(roleKey)})
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
        <table className="w-full text-sm">
          <caption className="sr-only">Benutzerkonten</caption>
          <thead className="border-b border-zinc-800 bg-zinc-800/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Benutzer
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Rolle
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                E-Mail
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Erweiterungen
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Registriert
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {withProfiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Keine Benutzer passen zu den Filterkriterien.
                </td>
              </tr>
            ) : (
              withProfiles.map(({ user, pluginsCount, themesCount }) => (
                <tr key={user.id} className="transition-colors hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${user.id}`} className="group flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 group-hover:bg-violet-500/10 group-hover:text-violet-400">
                        <UserIcon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block font-semibold text-white group-hover:text-violet-400">
                          {user.name || user.email.split('@')[0]}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {user.id.slice(0, 8)}…
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${ROLE_CLASSES[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-zinc-300">{user.email}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                      {user.emailVerified ? (
                        <>
                          <CheckIcon className="h-3 w-3 text-emerald-400" />
                          Verifiziert
                        </>
                      ) : (
                        <>
                          <AlertIcon className="h-3 w-3 text-amber-400" />
                          Nicht verifiziert
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {pluginsCount} Plugins • {themesCount} Themes
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {formatDate(user.createdAt) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-violet-400 transition-colors hover:bg-violet-500/10 hover:text-violet-300"
                    >
                      Details
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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

      {admin.role === 'ADMIN' ? (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <ShieldIcon className="h-4 w-4" />
          Systemadministrator-Konten können nur von Systemadministratoren geändert werden.
        </p>
      ) : null}
    </div>
  );
}

export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; page?: string; roleChanged?: string; error?: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-zinc-500">Benutzer werden geladen...</div>}
    >
      <UsersContent searchParams={searchParams} />
    </Suspense>
  );
}
