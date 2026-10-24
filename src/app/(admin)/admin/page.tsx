import { Suspense } from 'react';
import Link from 'next/link';
import { getServerAuthSession } from '@/lib/server-auth';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import {
  ShieldIcon,
  UserIcon,
  PlugIcon,
  PaletteIcon,
  NewsIcon,
  ClockIcon,
  BookIcon,
  ArrowRightIcon,
} from '@/components/ui/icons';

async function AdminContent() {
  const user = await requireAdminSession();

  // Get statistics
  const [
    userCount,
    pendingPlugins,
    pendingThemes,
    approvedPlugins,
    approvedThemes,
    recentAuditLogs,
    unpublishedNews,
  ] = await Promise.all([
    db.orm.public.User.all().then((users) => users.length),
    db.orm.public.Plugin.where({ status: 'PENDING_REVIEW' }).all().then((plugins) => plugins.length),
    db.orm.public.Theme.where({ status: 'PENDING_REVIEW' }).all().then((themes) => themes.length),
    db.orm.public.Plugin.where({ status: 'APPROVED', isPublished: true }).all().then((plugins) => plugins.length),
    db.orm.public.Theme.where({ status: 'APPROVED', isPublished: true }).all().then((themes) => themes.length),
    db.orm.public.AuditLog.orderBy((log) => log.createdAt.desc()).limit(5).all(),
    db.orm.public.News.where({ isPublished: false }).all().then((news) => news.length),
  ]);

  // Get recent users
  const recentUsers = await db.orm.public.User
    .orderBy((user) => user.createdAt.desc())
    .limit(5)
    .all();

  // Get recent plugins and themes
  const recentPlugins = await db.orm.public.Plugin
    .orderBy((plugin) => plugin.createdAt.desc())
    .limit(5)
    .all();

  const recentThemes = await db.orm.public.Theme
    .orderBy((theme) => theme.createdAt.desc())
    .limit(5)
    .all();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Administrations-Dashboard
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Willkommen im Admin-Bereich, {user.name || user.email}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 group hover:border-rose-500/20 transition-colors">
          <Link href="/admin/users" className="block">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 transition-colors">
                <UserIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm text-zinc-400 font-medium">Benutzer gesamt</div>
              <div className="text-2xl font-bold text-white mt-1">{userCount}</div>
            </div>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 group hover:border-rose-500/20 transition-colors">
          <Link href="/admin/moderation" className="block">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                <ClockIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm text-zinc-400 font-medium">In Prüfung</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                {pendingPlugins + pendingThemes}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {pendingPlugins} Plugins • {pendingThemes} Themes
              </div>
            </div>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 group hover:border-rose-500/20 transition-colors">
          <Link href="/admin/news" className="block">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 transition-colors">
                <NewsIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm text-zinc-400 font-medium">Veröffentlichte Inhalte</div>
              <div className="text-2xl font-bold text-violet-400 mt-1">
                {approvedPlugins + approvedThemes}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {approvedPlugins} Plugins • {approvedThemes} Themes
              </div>
            </div>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 group hover:border-rose-500/20 transition-colors">
          <Link href="/admin/audit" className="block">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 transition-colors">
                <BookIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm text-zinc-400 font-medium">Nicht veröffentlichte News</div>
              <div className="text-2xl font-bold text-rose-400 mt-1">{unpublishedNews}</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <ButtonLink
          href="/admin/users"
          size="md"
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          <UserIcon className="h-4 w-4" />
          Benutzer verwalten
        </ButtonLink>
        <ButtonLink
          href="/admin/moderation"
          size="md"
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          <ClockIcon className="h-4 w-4" />
          Moderation ({pendingPlugins + pendingThemes})
        </ButtonLink>
        <ButtonLink
          href="/admin/news"
          size="md"
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          <NewsIcon className="h-4 w-4" />
          News verwalten
        </ButtonLink>
        <ButtonLink
          href="/admin/audit"
          size="md"
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          <BookIcon className="h-4 w-4" />
          Audit-Log ansehen
        </ButtonLink>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Audit Logs */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Letzte Audit-Einträge
          </h2>
          {recentAuditLogs.length === 0 ? (
            <div className="p-6 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
              <p className="text-zinc-400 text-sm">Keine Audit-Einträge gefunden</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{log.action}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {formatDateTime(log.createdAt)}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">
                      {log.id.substring(0, 8)}...
                    </span>
                  </div>
                  {log.details && (
                    <div className="text-xs text-zinc-400 mt-2 truncate">
                      {log.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <ButtonLink
              href="/admin/audit"
              size="sm"
              variant="ghost"
              className="w-full"
            >
              Alle Audit-Einträge anzeigen
              <ArrowRightIcon className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>

        {/* Recent Users and Content */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Neuste Benutzer & Inhalte
          </h2>
          <div className="space-y-4">
            {/* Recent Users */}
            {recentUsers.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Neue Benutzer</h3>
                <div className="space-y-2">
                  {recentUsers.map((user) => (
                    <Link
                      key={user.id}
                      href={`/admin/users/${user.id}`}
                      className="block p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {user.name || user.email}
                          </div>
                          <div className="text-xs text-zinc-500">
                            Rolle: {user.role}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {user.emailVerified ? '✓ Verifiziert' : '✗ Nicht verifiziert'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Plugins */}
            {recentPlugins.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Neue Plugins</h3>
                <div className="space-y-2">
                  {recentPlugins.map((plugin) => (
                    <Link
                      key={plugin.id}
                      href={`/admin/moderation/${plugin.id}`}
                      className="block p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">{plugin.name}</div>
                          <div className="text-xs text-zinc-500">
                            Status: {plugin.status}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono">
                          v{plugin.id.substring(0, 8)}...
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Themes */}
            {recentThemes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Neue Themes</h3>
                <div className="space-y-2">
                  {recentThemes.map((theme) => (
                    <Link
                      key={theme.id}
                      href={`/admin/moderation/${theme.id}`}
                      className="block p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">{theme.name}</div>
                          <div className="text-xs text-zinc-500">
                            Status: {theme.status}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono">
                          v{theme.id.substring(0, 8)}...
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4">
            <ButtonLink
              href="/admin/users"
              size="sm"
              variant="ghost"
              className="w-full"
            >
              Alle Benutzer anzeigen
              <ArrowRightIcon className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Dashboard wird geladen...
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
