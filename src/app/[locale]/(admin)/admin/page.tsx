import { Suspense } from 'react';
import Link from '@/i18n/navigation';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { ButtonLink } from '@/components/ui/button';
import {
  UserIcon,
  NewsIcon,
  ClockIcon,
  BookIcon,
  ArrowRightIcon,
  AlertIcon,
} from '@/components/ui/icons';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

async function AdminContent() {
  const user = await requireAdminSession();
  const emailConfigured = Boolean(process.env['EMAIL_SERVER_HOST']);

  // A single failing query (for example a table that the deployed schema does
  // not contain yet) must not blank the whole admin area. Every query is settled
  // separately; unavailable values render as "–" instead of an invented number.
  const results = await Promise.allSettled([
    db.orm.public.User.all(),
    db.orm.public.Plugin.where({ status: 'PENDING_REVIEW' }).all(),
    db.orm.public.Theme.where({ status: 'PENDING_REVIEW' }).all(),
    db.orm.public.Plugin.where({ status: 'APPROVED', isPublished: true }).all(),
    db.orm.public.Theme.where({ status: 'APPROVED', isPublished: true }).all(),
    db.orm.public.AuditLog.orderBy((log) => log.createdAt.desc()).limit(5).all(),
    db.orm.public.News.where({ isPublished: false }).all(),
    db.orm.public.User.orderBy((user) => user.createdAt.desc()).limit(5).all(),
    db.orm.public.Plugin.orderBy((plugin) => plugin.createdAt.desc()).limit(5).all(),
    db.orm.public.Theme.orderBy((theme) => theme.createdAt.desc()).limit(5).all(),
  ]);

  type AuditEntry = {
    id: string;
    action: string;
    details: string | null;
    createdAt: { toString(): string };
  };
  type UserEntry = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    emailVerified: unknown;
  };
  type ContentEntry = { id: string; name: string; status: string };

  function count(index: number): number | null {
    const result = results[index];
    return result?.status === 'fulfilled' ? (result.value as unknown[]).length : null;
  }
  function list<T>(index: number): T[] | null {
    const result = results[index];
    return result?.status === 'fulfilled' ? (result.value as T[]) : null;
  }

  const userCount = count(0);
  const pendingPlugins = count(1);
  const pendingThemes = count(2);
  const approvedPlugins = count(3);
  const approvedThemes = count(4);
  const recentAuditLogs = list<AuditEntry>(5);
  const unpublishedNews = count(6);
  const recentUsers = list<UserEntry>(7);
  const recentPlugins = list<ContentEntry>(8);
  const recentThemes = list<ContentEntry>(9);
  const someStatsUnavailable = results.some((result) => result.status === 'rejected');

  const sum = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : a + b;
  const pendingTotal = sum(pendingPlugins, pendingThemes);
  const approvedTotal = sum(approvedPlugins, approvedThemes);

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

      {someStatsUnavailable ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Einige Statistiken nicht verfügbar</p>
            <p className="mt-0.5 text-amber-300/80">
              Mindestens eine Datenbankabfrage ist fehlgeschlagen. Betroffene Werte
              werden als „–“ angezeigt und nicht geschätzt.
            </p>
          </div>
        </div>
      ) : null}

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
              <div className="text-2xl font-bold text-white mt-1">{userCount ?? '–'}</div>
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
                {pendingTotal ?? '–'}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {pendingPlugins ?? '–'} Plugins • {pendingThemes ?? '–'} Themes
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
                {approvedTotal ?? '–'}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {approvedPlugins ?? '–'} Plugins • {approvedThemes ?? '–'} Themes
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
              <div className="text-2xl font-bold text-rose-400 mt-1">{unpublishedNews ?? '–'}</div>
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
          Moderation ({pendingTotal ?? '–'})
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

      {!emailConfigured ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">E-Mail-Versand nicht konfiguriert</p>
            <p className="mt-0.5 text-amber-300/80">
              SMTP ist nicht eingerichtet. E-Mail-Verifizierung und Passwort-Zurücksetzen sind
              deshalb nicht betriebsbereit; die Oberfläche weist darauf hin.
            </p>
          </div>
        </div>
      ) : null}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Audit Logs */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Letzte Audit-Einträge
          </h2>
          {recentAuditLogs === null ? (
            <div className="p-6 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
              <p className="text-zinc-400 text-sm">Audit-Einträge nicht verfügbar</p>
            </div>
          ) : recentAuditLogs.length === 0 ? (
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
            {recentUsers !== null && recentUsers.length > 0 && (
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
            {recentPlugins !== null && recentPlugins.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Neue Plugins</h3>
                <div className="space-y-2">
                  {recentPlugins.map((plugin) => (
                    <Link
                      key={plugin.id}
                      href={`/admin/moderation/PLUGIN/${plugin.id}`}
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
            {recentThemes !== null && recentThemes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Neue Themes</h3>
                <div className="space-y-2">
                  {recentThemes.map((theme) => (
                    <Link
                      key={theme.id}
                      href={`/admin/moderation/THEME/${theme.id}`}
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
