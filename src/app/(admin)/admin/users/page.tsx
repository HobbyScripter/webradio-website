import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/auth-service';
import { db } from '@/lib/db';
import { roleSchema } from '@/lib/validations';
import { ButtonLink } from '@/components/ui/button';
import {
  UserIcon,
  SearchIcon,
  ShieldIcon,
  MailIcon,
  CheckIcon,
  ClockIcon,
  AlertIcon,
  ChevronRightIcon,
} from '@/components/ui/icons';

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  USER: { bg: 'bg-zinc-800', text: 'text-zinc-400' },
  DEVELOPER: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
  ADMIN: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  SYSTEM_ADMIN: { bg: 'bg-rose-500/10', text: 'text-rose-400' },
};

const ROLE_LABELS: Record<string, string> = {
  USER: 'Benutzer',
  DEVELOPER: 'Entwickler',
  ADMIN: 'Administrator',
  SYSTEM_ADMIN: 'Systemadministrator',
};

async function UsersContent({ searchParams }: { searchParams: Promise<{ search?: string; role?: string; page?: string }> }) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/admin/users');
  }

  if (!hasRole(session.user.role, 'ADMIN')) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-zinc-900 border border-rose-900/50 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-xl font-bold text-white">403 — Keine Berechtigung</h2>
        <p className="text-zinc-400 text-sm">
          Dieser Bereich ist nur für Administratoren zugänglich.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    );
  }

  const { search = '', role = '', page = '1' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const perPage = 20;

  // Build query
  let usersQuery = db.orm.public.User.orderBy((u) => u.createdAt.desc());

  if (search) {
    usersQuery = usersQuery.where((u) =>
      u.email.ilike(`%${search}%`)
    );
  }

  const roleFilter = roleSchema.safeParse(role);
  if (roleFilter.success) {
    usersQuery = usersQuery.where((u) => u.role.eq(roleFilter.data));
  }

  const allUsers = await usersQuery.all();
  const totalUsers = allUsers.length;
  const totalPages = Math.ceil(totalUsers / perPage);
  const users = allUsers.slice((pageNum - 1) * perPage, pageNum * perPage);

  // Get developer profiles
  const usersWithProfiles = await Promise.all(
    users.map(async (user) => {
      const profile = await db.orm.public.DeveloperProfile.where({
        userId: user.id,
      }).first();
      
      const pluginsCount = profile
        ? (await db.orm.public.Plugin.where({ developerId: profile.id }).all()).length
        : 0;
      const themesCount = profile
        ? (await db.orm.public.Theme.where({ developerId: profile.id }).all()).length
        : 0;

      return {
        ...user,
        profile,
        pluginsCount,
        themesCount,
        createdAt: user.createdAt.toString(),
        emailVerified: user.emailVerified?.toString() || null,
      };
    })
  );

  // Count by role
  const roleCounts: Record<string, number> = {
    all: totalUsers,
    USER: allUsers.filter((u) => u.role === 'USER').length,
    DEVELOPER: allUsers.filter((u) => u.role === 'DEVELOPER').length,
    ADMIN: allUsers.filter((u) => u.role === 'ADMIN').length,
    SYSTEM_ADMIN: allUsers.filter((u) => u.role === 'SYSTEM_ADMIN').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <UserIcon className="h-6 w-6" />
            Benutzerverwaltung
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Verwalte Benutzerkonten und Rollen
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-white">{totalUsers}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Benutzer gesamt</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-violet-400">{roleCounts.DEVELOPER}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Entwickler</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-amber-400">{roleCounts.ADMIN}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Administratoren</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-rose-400">{roleCounts.SYSTEM_ADMIN}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Systemadmins</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-zinc-300">{roleCounts.USER}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Normale Benutzer</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            placeholder="Suche nach E-Mail..."
            defaultValue={search}
            className="w-full rounded-xl border border-white/10 bg-[#07070a] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Link
            href="/admin/users"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              role === '' || role === 'all'
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Alle ({roleCounts.all})
          </Link>
          <Link
            href="/admin/users?role=USER"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              role === 'USER'
                ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Benutzer ({roleCounts.USER})
          </Link>
          <Link
            href="/admin/users?role=DEVELOPER"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              role === 'DEVELOPER'
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Entwickler ({roleCounts.DEVELOPER})
          </Link>
          <Link
            href="/admin/users?role=ADMIN"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              role === 'ADMIN'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Admins ({roleCounts.ADMIN})
          </Link>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 border-b border-zinc-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Benutzer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                E-Mail
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Rolle
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Erweiterungen
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Registriert
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Aktionen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {usersWithProfiles.map((user) => {
              const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.USER;
              const roleLabel = ROLE_LABELS[user.role] || user.role;

              return (
                <tr key={user.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 group-hover:bg-violet-500/10 group-hover:text-violet-400 transition-colors">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white group-hover:text-violet-400">
                          {user.name || user.email.split('@')[0]}
                        </div>
                        <div className="text-xs text-zinc-500">ID: {user.id.slice(0, 8)}...</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-zinc-300">{user.email}</div>
                    {!user.emailVerified && (
                      <span className="text-xs text-amber-400">Nicht verifiziert</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium ${roleColor.bg} ${roleColor.text}`}
                    >
                      {roleLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {user.emailVerified ? (
                        <CheckIcon className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <AlertIcon className="h-4 w-4 text-amber-400" />
                      )}
                      <span className="text-xs text-zinc-400">
                        {user.emailVerified ? 'Verifiziert' : 'Nicht verifiziert'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-zinc-400">
                      {user.pluginsCount} Plugins • {user.themesCount} Themes
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500">
                      {new Date(user.createdAt).toLocaleDateString('de-DE', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                        title="Details"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-zinc-500">
            Seite {pageNum} von {totalPages}
          </p>
          <div className="flex gap-1">
            <Link
              href={`/admin/users?page=${Math.max(1, pageNum - 1)}&search=${search}&role=${role}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pageNum <= 1
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Zurück
            </Link>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const pageNumToShow = 
                totalPages <= 7
                  ? i + 1
                  : pageNum <= 4
                    ? i + 1
                    : pageNum >= totalPages - 3
                      ? totalPages - 6 + i
                      : pageNum - 3 + i;

              if (pageNumToShow < 1 || pageNumToShow > totalPages) return null;

              return (
                <Link
                  key={pageNumToShow}
                  href={`/admin/users?page=${pageNumToShow}&search=${search}&role=${role}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    pageNumToShow === pageNum
                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {pageNumToShow}
                </Link>
              );
            })}
            <Link
              href={`/admin/users?page=${Math.min(totalPages, pageNum + 1)}&search=${search}&role=${role}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pageNum >= totalPages
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Weiter
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; page?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Benutzer werden geladen...
        </div>
      }
    >
      <UsersContent searchParams={searchParams} />
    </Suspense>
  );
}
