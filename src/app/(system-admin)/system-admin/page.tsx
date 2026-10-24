import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/auth-service';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import {
  UserIcon,
  DatabaseIcon,
  SettingsIcon,
  ArrowLeftIcon,
  ServerIcon,
  LockIcon,
  BookIcon,
} from '@/components/ui/icons';

export default async function SystemAdminDashboardPage() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/system-admin');
  }

  if (!hasRole(session.user.role, 'SYSTEM_ADMIN')) {
    redirect('/');
  }

  // Get system statistics
  const [
    totalUsers,
    adminUsers,
    systemAdminUsers,
    totalPlugins,
    totalThemes,
    totalAuditLogs,
    totalNews,
    totalRateLimitBuckets,
  ] = await Promise.all([
    db.orm.public.User.all().then((users) => users.length),
    db.orm.public.User.where({ role: 'ADMIN' }).all().then((admins) => admins.length),
    db.orm.public.User.where({ role: 'SYSTEM_ADMIN' }).all().then((sysAdmins) => sysAdmins.length),
    db.orm.public.Plugin.all().then((plugins) => plugins.length),
    db.orm.public.Theme.all().then((themes) => themes.length),
    db.orm.public.AuditLog.all().then((logs) => logs.length),
    db.orm.public.News.all().then((news) => news.length),
    db.orm.public.RateLimitBucket.all().then((buckets) => buckets.length),
  ]);

  // Get database info
  const [latestUser, latestPlugin, latestTheme] = await Promise.all([
    db.orm.public.User.orderBy((u) => u.createdAt.desc()).first(),
    db.orm.public.Plugin.orderBy((p) => p.createdAt.desc()).first(),
    db.orm.public.Theme.orderBy((t) => t.createdAt.desc()).first(),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-rose-950/60 bg-rose-950/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Systemverwaltung
            </span>
            <span className="text-xs text-rose-300">
              Nur für Systemadministratoren
            </span>
          </div>
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-950/30 transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Zurück zur Administration
          </Link>
        </div>
      </div>

      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Systemadministration
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Willkommen im Systemadministrations-Bereich
            </p>
          </div>

          {/* System Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-950/60">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
                  <UserIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm text-zinc-400 font-medium">Benutzer gesamt</div>
                <div className="text-2xl font-bold text-white mt-1">{totalUsers}</div>
                <div className="text-xs text-rose-400 mt-1">
                  {adminUsers} Admins • {systemAdminUsers} System-Admins
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-950/60">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
                  <ServerIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm text-zinc-400 font-medium">Katalog-Inhalte</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">
                  {totalPlugins + totalThemes}
                </div>
                <div className="text-xs text-rose-400/60 mt-1">
                  {totalPlugins} Plugins • {totalThemes} Themes
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-950/60">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
                  <BookIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm text-zinc-400 font-medium">Audit-Logs</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">{totalAuditLogs}</div>
                <div className="text-xs text-rose-400/60 mt-1">Einträge</div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-950/60">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
                  <DatabaseIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm text-zinc-400 font-medium">Rate-Limit Buckets</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">{totalRateLimitBuckets}</div>
                <div className="text-xs text-rose-400/60 mt-1">Aktive Buckets</div>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                System-Status
              </h2>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-950/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">Datenbank</div>
                      <div className="text-xs text-rose-400/60">PostgreSQL</div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Verbunden
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-950/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">Authentifizierung</div>
                      <div className="text-xs text-rose-400/60">NextAuth.js v4</div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Aktiv
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-950/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">Sicherheit</div>
                      <div className="text-xs text-rose-400/60">RBAC & Rate-Limiting</div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Aktiv
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                Letzte Aktivitäten
              </h2>
              <div className="space-y-3">
                {latestUser && (
                  <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-950/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">
                          Neuer Benutzer
                        </div>
                        <div className="text-xs text-rose-400/60">
                          {latestUser.email}
                        </div>
                      </div>
                      <span className="text-xs text-rose-400/60">
                        {formatDate(latestUser.createdAt)}
                      </span>
                    </div>
                  </div>
                )}

                {latestPlugin && (
                  <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-950/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">
                          Neues Plugin
                        </div>
                        <div className="text-xs text-rose-400/60">
                          {latestPlugin.name}
                        </div>
                      </div>
                      <span className="text-xs text-rose-400/60">
                        {formatDate(latestPlugin.createdAt)}
                      </span>
                    </div>
                  </div>
                )}

                {latestTheme && (
                  <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-950/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">
                          Neues Theme
                        </div>
                        <div className="text-xs text-rose-400/60">
                          {latestTheme.name}
                        </div>
                      </div>
                      <span className="text-xs text-rose-400/60">
                        {formatDate(latestTheme.createdAt)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              Sicherheitsverwaltung
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-6 rounded-xl bg-rose-950/20 border border-rose-950/40">
                <div className="flex items-center justify-between">
                  <div>
                    <LockIcon className="h-5 w-5 text-rose-400" />
                    <div className="text-sm font-medium text-white mt-2">
                      Sicherheits-Einstellungen
                    </div>
                    <div className="text-xs text-rose-400/60 mt-0.5">
                      Sessions, Rate-Limits & mehr
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-xl bg-rose-950/20 border border-rose-950/40">
                <div className="flex items-center justify-between">
                  <div>
                    <SettingsIcon className="h-5 w-5 text-rose-400" />
                    <div className="text-sm font-medium text-white mt-2">
                      Bootstrap & Recovery
                    </div>
                    <div className="text-xs text-rose-400/60 mt-0.5">
                      SYSTEM_ADMIN Tools
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-rose-950/40">
            <p className="text-xs text-rose-400/60">
              Hinweis: Systemadministrations-Aktionen werden komplett im Audit-Log protokolliert.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
