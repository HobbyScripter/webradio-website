import Link from 'next/link';
import { requireRoleSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import {
  ShieldIcon,
  UserIcon,
  BookIcon,
  CheckIcon,
  AlertIcon,
  ServerIcon,
  MailIcon,
} from '@/components/ui/icons';

export default async function SystemAdminDashboardPage() {
  await requireRoleSession('SYSTEM_ADMIN');

  const [users, plugins, themes, news, auditLogs, sessions, rateLimitBuckets] =
    await Promise.all([
      db.orm.public.User.all(),
      db.orm.public.Plugin.all(),
      db.orm.public.Theme.all(),
      db.orm.public.News.all(),
      db.orm.public.AuditLog.orderBy((log) => log.createdAt.desc()).limit(10).all(),
      db.orm.public.Session.all(),
      db.orm.public.RateLimitBucket.all(),
    ]);

  const admins = users.filter((user) => user.role === 'ADMIN').length;
  const systemAdmins = users.filter((user) => user.role === 'SYSTEM_ADMIN').length;
  const verified = users.filter((user) => user.emailVerified !== null).length;
  const pendingCatalog =
    plugins.filter((plugin) => plugin.status === 'PENDING_REVIEW').length +
    themes.filter((theme) => theme.status === 'PENDING_REVIEW').length;

  // Operational checks that can be answered without contacting external
  // systems. Anything that would need a real mail provider is only reported as
  // configured/not configured, never as "working".
  const smtpConfigured = Boolean(process.env['EMAIL_SERVER_HOST']);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <ShieldIcon className="h-6 w-6" />
          Systemadministration
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Höchste Berechtigungsstufe. Änderungen an dieser Rolle sind nur über den auditierten
          CLI-Bootstrap/Recovery-Weg möglich.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-rose-950/60 bg-rose-950/20 p-5">
          <UserIcon className="h-5 w-5 text-rose-400" />
          <div className="mt-3 text-sm text-zinc-400">Benutzerkonten</div>
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="mt-1 text-xs text-rose-300">
            {admins} Admins • {systemAdmins} System-Admins
          </div>
        </div>

        <div className="rounded-2xl border border-rose-950/60 bg-rose-950/20 p-5">
          <ServerIcon className="h-5 w-5 text-rose-400" />
          <div className="mt-3 text-sm text-zinc-400">Katalog</div>
          <div className="text-2xl font-bold text-white">{plugins.length + themes.length}</div>
          <div className="mt-1 text-xs text-rose-300">
            {plugins.length} Plugins • {themes.length} Themes • {pendingCatalog} offen
          </div>
        </div>

        <div className="rounded-2xl border border-rose-950/60 bg-rose-950/20 p-5">
          <BookIcon className="h-5 w-5 text-rose-400" />
          <div className="mt-3 text-sm text-zinc-400">News</div>
          <div className="text-2xl font-bold text-white">{news.length}</div>
          <div className="mt-1 text-xs text-rose-300">
            {news.filter((article) => article.isPublished).length} veröffentlicht
          </div>
        </div>

        <div className="rounded-2xl border border-rose-950/60 bg-rose-950/20 p-5">
          <ShieldIcon className="h-5 w-5 text-rose-400" />
          <div className="mt-3 text-sm text-zinc-400">Aktive Sitzungen</div>
          <div className="text-2xl font-bold text-white">{sessions.length}</div>
          <div className="mt-1 text-xs text-rose-300">
            {rateLimitBuckets.length} Rate-Limit-Buckets
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Betriebsstatus</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span className="text-zinc-300">
                Datenbank erreichbar; Rollen werden bei jeder Anfrage neu aus PostgreSQL gelesen.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span className="text-zinc-300">
                {verified} von {users.length} Konten haben eine bestätigte E-Mail-Adresse.
              </span>
            </li>
            <li className="flex items-start gap-2">
              {smtpConfigured ? (
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              )}
              <span className="text-zinc-300">
                {smtpConfigured
                  ? 'SMTP ist konfiguriert. Der tatsächliche Versand ist damit noch nicht nachgewiesen.'
                  : 'SMTP ist nicht konfiguriert. E-Mail-Verifizierung und Passwort-Zurücksetzen können keine Nachrichten zustellen.'}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span className="text-zinc-300">
                Es muss immer mindestens ein Systemadministrator bestehen bleiben; die
                Herabstufung des letzten Kontos wird serverseitig abgelehnt.
              </span>
            </li>
          </ul>
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <MailIcon className="h-4 w-4" />
            Bootstrap und Recovery laufen ausschließlich über die auditierte CLI, nie über HTTP.
          </p>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Letzte Audit-Ereignisse</h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-zinc-400">Keine Audit-Einträge vorhanden.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 text-sm">
              {auditLogs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-zinc-200">{log.action}</span>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(log.createdAt) ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href="/admin/audit"
              className="text-xs font-semibold text-rose-300 hover:text-rose-200"
            >
              Vollständiges Audit-Protokoll
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
