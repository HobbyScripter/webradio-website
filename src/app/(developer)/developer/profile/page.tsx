import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { ButtonLink, Button } from '@/components/ui/button';
import {
  CodeIcon,
  UserIcon,
  PencilIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
} from '@/components/ui/icons';

// Authenticated dashboard: the session and profile lookups are request data, so
// this route must render on demand instead of being prerendered.
export const instant = false;

export default async function DeveloperProfilePage() {
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!profile) {
    redirect('/developer/profile/create');
  }

  // Get user's plugins and themes
  const [plugins, themes] = await Promise.all([
    db.orm.public.Plugin.where({ developerId: profile.id }).all(),
    db.orm.public.Theme.where({ developerId: profile.id }).all(),
  ]);

  const totalExtensions = plugins.length + themes.length;
  const totalDownloads = [...plugins, ...themes].reduce((sum, entry) => sum + entry.downloads, 0);

  async function deleteProfile() {
    'use server';

    const user = await requireDeveloperSession();

    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      redirect('/developer/profile/create');
    }

    // Delete profile
    await db.orm.public.DeveloperProfile.where({ id: profile.id }).delete();

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'DEVELOPER_PROFILE_DELETED',
        details: JSON.stringify({ profileId: profile.id, displayName: profile.displayName }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    redirect('/developer');
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/developer"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </Link>
        <ButtonLink
          href="/developer/profile/edit"
          size="sm"
          variant="secondary"
          className="inline-flex items-center gap-2"
        >
          <PencilIcon className="h-4 w-4" />
          Bearbeiten
        </ButtonLink>
      </div>

      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <CodeIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Dein Entwicklerprofil
            </h1>
            <p className="text-zinc-400 mt-1">
              Verwalte deine Entwicklerinformationen
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="mt-8 p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                  <UserIcon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">{profile.displayName}</h2>
                  <p className="text-sm text-zinc-400">Entwicklerprofil</p>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-4">
              {profile.bio && (
                <div>
                  <div className="text-xs text-zinc-500 font-medium uppercase">Bio</div>
                  <p className="text-sm text-zinc-300 mt-0.5">{profile.bio}</p>
                </div>
              )}

              {profile.githubUrl && (
                <div>
                  <div className="text-xs text-zinc-500 font-medium uppercase">GitHub</div>
                  <a
                    href={profile.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300"
                  >
                    {new URL(profile.githubUrl).hostname.replace('www.', '')}
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
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
                    className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300"
                  >
                    {new URL(profile.websiteUrl).hostname.replace('www.', '')}
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500 font-medium uppercase">Erstellt am</div>
              <div className="text-sm text-zinc-300 mt-0.5">
                {formatDate(profile.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-medium uppercase">Aktualisiert am</div>
              <div className="text-sm text-zinc-300 mt-0.5">
                {formatDate(profile.updatedAt)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 font-medium uppercase">Benutzer-ID</div>
              <div className="text-sm text-zinc-300 mt-0.5 font-mono">{profile.id}</div>
            </div>
          </div>
        </div>

        {/* Statistics Card */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Erweiterungen</div>
            <div className="text-2xl font-bold text-white mt-1">{totalExtensions}</div>
            <div className="text-xs text-zinc-500 mt-1">
              {plugins.length} Plugins • {themes.length} Themes
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Downloads gesamt</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{totalDownloads}</div>
            <div className="text-xs text-zinc-500 mt-1">Alle Erweiterungen</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs text-zinc-500 font-medium uppercase">Status</div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-1">
              Aktiv
            </span>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-8 p-6 rounded-xl bg-rose-500/5 border border-rose-500/10">
          <h3 className="text-sm font-semibold text-rose-200 mb-2">Gefahrenzone</h3>
          <p className="text-sm text-rose-300/60 mb-4">
            Das Löschen deines Entwicklerprofils entfernt alle deine Plugins, Themes und Einreichungen.
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <form action={deleteProfile}>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              className="inline-flex items-center gap-2"
            >
              <span className="h-4 w-4 bg-rose-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                !
              </span>
              Entwicklerprofil löschen
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
