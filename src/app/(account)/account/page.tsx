import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { Container, SectionHeading } from '@/components/ui/layout';
import { ButtonLink } from '@/components/ui/button';
import { UserIcon, SettingsIcon, ShieldIcon, CalendarIcon, CheckIcon, AlertIcon } from '@/components/ui/icons';

// Authenticated dashboard: session and profile lookups are request data.
export const instant = false;

async function AccountDashboardContent() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/account');
  }

  // Fetch user profile data
  const user = await db.orm.public.User.first({ id: session.user.id });
  const developerProfile = await db.orm.public.DeveloperProfile.where({
    userId: session.user.id,
  }).first();

  if (!user) {
    redirect('/auth/login?callbackUrl=/account');
  }

  // Count sessions
  const activeSessions = await db.orm.public.Session.where({
    userId: session.user.id,
  }).all();

  const isEmailVerified = user.emailVerified !== null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Mein Konto</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Angemeldet als <span className="text-violet-400 font-medium">{session.user.email}</span>
            <span className="ml-2 font-mono text-[11px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {session.user.role}
            </span>
          </p>
        </div>
      </div>

      {/* Alert: Email not verified */}
      {!isEmailVerified && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200 flex items-start gap-3">
          <AlertIcon className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">E-Mail-Adresse nicht bestätigt</p>
            <p className="mt-0.5 text-amber-300/80">
              Deine E-Mail-Adresse ist noch nicht verifiziert. Bestätige sie, um alle Funktionen nutzen zu können.
            </p>
            <Link
              href="/auth/verify-email/resend"
              className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-amber-300 hover:text-amber-200"
            >
              Bestätigungslink anfordern
            </Link>
          </div>
        </div>
      )}

      {/* Account Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400">
              <UserIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Profilstatus</div>
            <div className="text-xl font-bold text-white mt-1 flex items-center gap-2">
              {isEmailVerified ? 'Verifiziert' : 'Nicht verifiziert'}
              {isEmailVerified ? (
                <CheckIcon className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertIcon className="h-4 w-4 text-amber-400" />
              )}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {isEmailVerified ? 'E-Mail bestätigt' : 'E-Mail-Bestätigung ausstehend'}
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-zinc-800 text-zinc-300">
              <CalendarIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Konto erstellt</div>
            <div className="text-xl font-bold text-white mt-1">
              {user.createdAt.toString().split('T')[0]}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {new Date(user.createdAt.toString()).toLocaleDateString('de-DE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-zinc-800 text-zinc-300">
              <ShieldIcon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-zinc-400 font-medium">Aktive Sitzungen</div>
            <div className="text-xl font-bold text-white mt-1">{activeSessions.length}</div>
            <div className="text-xs text-zinc-500 mt-1">
              {activeSessions.length === 1 ? '1 aktive Sitzung' : `${activeSessions.length} aktive Sitzungen`}
            </div>
          </div>
        </div>
      </div>

      {/* Developer Profile Section */}
      {developerProfile && (
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
              <CodeIcon className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-white">Entwicklerprofil</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-500 font-medium uppercase">Anzeigename</div>
              <div className="text-sm text-white mt-0.5">{developerProfile.displayName}</div>
            </div>
            {developerProfile.githubUrl && (
              <div>
                <div className="text-xs text-zinc-500 font-medium uppercase">GitHub</div>
                <a
                  href={developerProfile.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-violet-400 mt-0.5 hover:text-violet-300"
                >
                  GitHub-Profil
                </a>
              </div>
            )}
            {developerProfile.websiteUrl && (
              <div>
                <div className="text-xs text-zinc-500 font-medium uppercase">Website</div>
                <a
                  href={developerProfile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-violet-400 mt-0.5 hover:text-violet-300"
                >
                  {new URL(developerProfile.websiteUrl).hostname}
                </a>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              Zum Developer-Dashboard
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <SectionHeading
        title="Schnellzugriff"
        description="Häufig verwendete Kontoaktionen"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/account/profile"
          className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
        >
          <div className="p-3 rounded-lg bg-violet-500/10 text-violet-400">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Profil bearbeiten</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Name, E-Mail und Anzeigename ändern</p>
          </div>
        </Link>

        <Link
          href="/account/security"
          className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
        >
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Sicherheit</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Passwort ändern und Sitzungen verwalten</p>
          </div>
        </Link>

        <Link
          href="/developer"
          className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
        >
          <div className="p-3 rounded-lg bg-violet-500/10 text-violet-400">
            <CodeIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Developer-Bereich</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Plugins und Themes verwalten</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

// Icons
import { ArrowRightIcon, CodeIcon } from '@/components/ui/icons';

export default function AccountDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">Kontodaten werden geladen...</div>
      }
    >
      <AccountDashboardContent />
    </Suspense>
  );
}
