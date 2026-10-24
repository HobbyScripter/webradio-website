import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';

async function AdminContent() {
  // Database-backed: the linked session must still exist and be unexpired.
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/admin');
  }

  // Server-side RBAC check against the current database role (never the JWT claim).
  if (session.user.role !== 'ADMIN') {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-zinc-900 border border-rose-900/50 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-xl font-bold text-white">403 — Keine Administrator-Berechtigung</h2>
        <p className="text-zinc-400 text-sm">
          Dein Konto (<span className="text-zinc-200">{session.user.email}</span>) besitzt die Rolle{' '}
          <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-amber-400">
            {session.user.role}
          </span>
          . Dieser Bereich erfordert die Rolle{' '}
          <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-rose-400">
            ADMIN
          </span>
          .
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

  // Only reachable with a verified ADMIN session above.
  const [users, plugins, themes, auditLogs] = await Promise.all([
    db.orm.public.User.all(),
    db.orm.public.Plugin.where({ status: 'PENDING_REVIEW' }).all(),
    db.orm.public.Theme.where({ status: 'PENDING_REVIEW' }).all(),
    db.orm.public.AuditLog.orderBy((a) => a.createdAt.desc()).limit(5).all(),
  ]);

  const pendingReviews = plugins.length + themes.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Systemadministration</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Angemeldet als Administrator:{' '}
            <span className="text-emerald-400 font-medium">{session.user.email}</span>
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20">
          Admin-Konsole aktiv
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-semibold uppercase">Benutzer</div>
          <div className="text-2xl font-bold text-white mt-1">{users.length}</div>
        </div>
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-semibold uppercase">Ausstehende Reviews</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{pendingReviews}</div>
        </div>
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-semibold uppercase">Letzte Audit-Einträge</div>
          <div className="text-2xl font-bold text-zinc-300 mt-1">{auditLogs.length}</div>
        </div>
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-xs text-zinc-400 font-semibold uppercase">Datenbank</div>
          <div className="text-sm font-semibold text-emerald-400 mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Abfragen erfolgreich
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide mb-3">
          Audit-Log (neueste 5)
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-zinc-500">Noch keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 text-sm">
            {auditLogs.map((entry) => (
              <li key={entry.id} className="py-2 flex items-center justify-between gap-4">
                <span className="font-mono text-xs text-violet-300">{entry.action}</span>
                <span className="text-xs text-zinc-500">
                  {entry.createdAt.toString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">Sitzung wird überprüft...</div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
