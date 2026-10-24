import { Suspense } from 'react';
import Link from 'next/link';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { ButtonLink } from '@/components/ui/button';
import {
  CodeIcon,
  PlusIcon,
  ClockIcon,
  DownloadIcon,
  PaletteIcon,
  PlugIcon,
  ArrowRightIcon,
} from '@/components/ui/icons';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

async function DeveloperContent() {
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  // Get plugins and themes
  const [plugins, themes] = profile
    ? await Promise.all([
        db.orm.public.Plugin.where({ developerId: profile.id }).all(),
        db.orm.public.Theme.where({ developerId: profile.id }).all(),
      ])
    : [[], []];

  // Count by status
  const pluginStats = {
    total: plugins.length,
    draft: plugins.filter((p) => p.status === 'DRAFT').length,
    pending: plugins.filter((p) => p.status === 'PENDING_REVIEW').length,
    changesRequested: plugins.filter((p) => p.status === 'CHANGES_REQUESTED').length,
    approved: plugins.filter((p) => p.status === 'APPROVED').length,
    published: plugins.filter((p) => p.isPublished && p.status === 'APPROVED').length,
  };

  const themeStats = {
    total: themes.length,
    draft: themes.filter((t) => t.status === 'DRAFT').length,
    pending: themes.filter((t) => t.status === 'PENDING_REVIEW').length,
    changesRequested: themes.filter((t) => t.status === 'CHANGES_REQUESTED').length,
    approved: themes.filter((t) => t.status === 'APPROVED').length,
    published: themes.filter((t) => t.isPublished && t.status === 'APPROVED').length,
  };

  const totalDownloads = [...plugins, ...themes].reduce((sum, entry) => sum + entry.downloads, 0);

  const userEmail = user.email;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Entwickler-Übersicht</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Angemeldet als <span className="text-violet-400 font-medium">{userEmail}</span> (Rolle: {user.role})
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/20">
          {profile ? 'Entwicklerprofil aktiv' : 'Kein Entwicklerprofil hinterlegt'}
        </span>
      </div>

      {user.emailVerified === null ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
          Deine E-Mail-Adresse ist noch nicht bestätigt. Für eine privilegierte Rolle ist
          eine bestätigte Adresse erforderlich.{' '}
          <Link href="/auth/verify-email/resend" className="font-semibold underline">
            Bestätigungslink anfordern
          </Link>
        </div>
      ) : null}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 group hover:border-violet-500/20 transition-colors">
          <Link href="/developer/plugins" className="block">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 transition-colors">
                <PlugIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm text-zinc-400 font-medium">Plugins gesamt</div>
              <div className="text-2xl font-bold text-white mt-1">{pluginStats.total}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {pluginStats.published} veröffentlicht • {pluginStats.pending} in Prüfung •{' '}
                {pluginStats.draft} Entwürfe
              </div>
            </div>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 group hover:border-violet-500/20 transition-colors">
          <Link href="/developer/themes" className="block">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 transition-colors">
                <PaletteIcon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-sm text-zinc-400 font-medium">Themes gesamt</div>
              <div className="text-2xl font-bold text-white mt-1">{themeStats.total}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {themeStats.published} veröffentlicht • {themeStats.pending} in Prüfung •{' '}
                {themeStats.draft} Entwürfe
              </div>
            </div>
          </Link>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
              <DownloadIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Downloads gesamt</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{totalDownloads}</div>
            <div className="text-xs text-zinc-500 mt-1">Summe aller Erweiterungen</div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
              <ClockIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">In Prüfung</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {pluginStats.pending + themeStats.pending}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {pluginStats.pending} Plugins • {themeStats.pending} Themes •{' '}
              {pluginStats.changesRequested + themeStats.changesRequested} mit Änderungswunsch
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <ButtonLink
          href="/developer/plugins/create"
          size="md"
          className="inline-flex items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Neues Plugin erstellen
        </ButtonLink>
        <ButtonLink
          href="/developer/themes/create"
          size="md"
          className="inline-flex items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Neues Theme erstellen
        </ButtonLink>
        <ButtonLink
          href="/developer/submissions"
          variant="secondary"
          size="md"
          className="inline-flex items-center gap-2"
        >
          <CodeIcon className="h-4 w-4" />
          Einreichungen verwalten
        </ButtonLink>
      </div>

      {/* Developer Profile Section */}
      {profile && (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
              <CodeIcon className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-white">Dein Entwicklerprofil</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500 font-medium uppercase">Anzeigename</div>
              <div className="text-sm text-white mt-0.5">{profile.displayName}</div>
            </div>
            {profile.githubUrl && (
              <div>
                <div className="text-xs text-zinc-500 font-medium uppercase">GitHub</div>
                <a
                  href={profile.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-violet-400 mt-0.5 hover:text-violet-300"
                >
                  GitHub-Profil
                </a>
              </div>
            )}
            {profile.websiteUrl && (
              <div>
                <div className="text-xs text-zinc-500 font-medium uppercase">Website</div>
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-violet-400 mt-0.5 hover:text-violet-300"
                >
                  {new URL(profile.websiteUrl).hostname}
                </a>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <Link
              href="/developer/profile"
              className="inline-flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              Profil bearbeiten
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* No profile section */}
      {!profile && (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
            <CodeIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white mt-4">Kein Entwicklerprofil</h3>
          <p className="text-zinc-400 text-sm mt-2">
            Erstelle ein Entwicklerprofil, um Plugins und Themes einzureichen.
          </p>
          <div className="mt-4">
            <ButtonLink
              href="/developer/profile/create"
              size="sm"
            >
              Entwicklerprofil erstellen
            </ButtonLink>
          </div>
        </div>
      )}

      {/* Empty State */}
      {profile && plugins.length === 0 && themes.length === 0 && (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white">Noch keine Erweiterungen eingereicht</h3>
          <p className="text-zinc-400 text-sm">
            Beginne mit der Erstellung deiner ersten WebRadio-Erweiterung.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
            <ButtonLink
              href="/developer/plugins/create"
              size="sm"
            >
              <PlusIcon className="h-4 w-4" />
              Neues Plugin
            </ButtonLink>
            <ButtonLink
              href="/developer/themes/create"
              size="sm"
            >
              <PlusIcon className="h-4 w-4" />
              Neues Theme
            </ButtonLink>
          </div>
          <div className="pt-2">
            <Link
              href="/docs#website-katalog"
              className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-300 hover:text-white"
            >
              Katalogregeln ansehen
            </Link>
          </div>
        </div>
      )}
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
