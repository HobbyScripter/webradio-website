import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/auth-service';
import { db } from '@/lib/db';

async function DeveloperContent() {
  // Database-backed session: revoked or expired sessions are rejected here.
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/developer');
  }

  // Server-side RBAC check against the current database role. A plain USER
  // must not see the developer portal even with a valid login.
  if (!hasRole(session.user.role, 'DEVELOPER')) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-zinc-900 border border-amber-900/50 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h2 className="text-xl font-bold text-white">403 — Kein Entwicklerzugang</h2>
        <p className="text-zinc-400 text-sm">
          Dein Konto (<span className="text-zinc-200">{session.user.email}</span>) besitzt die Rolle{' '}
          <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-amber-400">
            {session.user.role}
          </span>
          . Dieser Bereich erfordert die Rolle{' '}
          <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-violet-400">
            DEVELOPER
          </span>{' '}
          oder <span className="font-mono text-xs bg-zinc-800 px-2 py-0.5 rounded text-rose-400">ADMIN</span>.
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

  // Real counts for this developer profile. No placeholder statistics.
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: session.user.id,
  }).first();

  const [plugins, themes] = profile
    ? await Promise.all([
        db.orm.public.Plugin.where({ developerId: profile.id }).all(),
        db.orm.public.Theme.where({ developerId: profile.id }).all(),
      ])
    : [[], []];

  const publishedPlugins = plugins.filter(
    (plugin) => plugin.isPublished && plugin.status === 'APPROVED',
  ).length;
  const publishedThemes = themes.filter(
    (theme) => theme.isPublished && theme.status === 'APPROVED',
  ).length;
  const downloads = [...plugins, ...themes].reduce((sum, entry) => sum + entry.downloads, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Entwickler-Übersicht</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Angemeldet als <span className="text-violet-400 font-medium">{session.user.email}</span> (Rolle: {session.user.role})
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/20">
          {profile ? 'Entwicklerprofil aktiv' : 'Kein Entwicklerprofil hinterlegt'}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-sm text-zinc-400 font-medium">Veröffentlichte Plugins</div>
          <div className="text-3xl font-bold text-white mt-2">{publishedPlugins}</div>
          <div className="text-xs text-zinc-500 mt-1">von {plugins.length} eingereicht</div>
        </div>
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-sm text-zinc-400 font-medium">Veröffentlichte Themes</div>
          <div className="text-3xl font-bold text-white mt-2">{publishedThemes}</div>
          <div className="text-xs text-zinc-500 mt-1">von {themes.length} eingereicht</div>
        </div>
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="text-sm text-zinc-400 font-medium">Downloads gesamt</div>
          <div className="text-3xl font-bold text-violet-400 mt-2">{downloads}</div>
          <div className="text-xs text-zinc-500 mt-1">Summe der Katalogzähler</div>
        </div>
      </div>

      {/* Empty State / Quickstart */}
      <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center max-w-2xl mx-auto space-y-4">
        <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-white">Noch keine Erweiterungen eingereicht</h3>
        <p className="text-zinc-400 text-sm">
          {profile
            ? 'Für dieses Entwicklerprofil sind noch keine Plugins oder Themes hinterlegt.'
            : 'Für dein Konto existiert noch kein Entwicklerprofil. Ein Einreichungs-Workflow ist derzeit nicht implementiert.'}
        </p>
        <div className="pt-2">
          <Link
            href="/docs#entwickler"
            className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors"
          >
            Einreichungsprozess dokumentieren
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DeveloperDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Entwickler-Sitzung wird geladen...
        </div>
      }
    >
      <DeveloperContent />
    </Suspense>
  );
}
