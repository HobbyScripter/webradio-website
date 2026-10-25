import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { developerProfileSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import {
  CodeIcon,
  UserIcon,
  GlobeIcon,
  ArrowLeftIcon,
  CheckIcon,
} from '@/components/ui/icons';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

export default async function EditDeveloperProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!profile) {
    redirect('/developer/profile/create');
  }

  async function updateProfile(formData: FormData) {
    'use server';

    const user = await requireDeveloperSession();

    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      redirect('/developer/profile/create');
    }

    const rawData = {
      displayName: formData.get('displayName'),
      bio: formData.get('bio'),
      githubUrl: formData.get('githubUrl'),
      websiteUrl: formData.get('websiteUrl'),
    };

    const parsed = developerProfileSchema.safeParse(rawData);
    if (!parsed.success) {
      redirect(
        `/developer/profile/edit?error=${encodeURIComponent(
          // The same broken URL can produce two issues; show each text once.
          [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' '),
        )}`,
      );
    }

    // Check if displayName is being changed
    const displayNameChanged = parsed.data.displayName !== profile.displayName;

    await db.orm.public.DeveloperProfile.where({ id: profile.id }).update({
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      githubUrl: parsed.data.githubUrl ?? null,
      websiteUrl: parsed.data.websiteUrl ?? null,
    });

    // Create audit log
    try {
      const changes: Record<string, unknown> = {};
      if (displayNameChanged) {
        changes.displayName = { from: profile.displayName, to: parsed.data.displayName };
      }
      if (parsed.data.bio !== profile.bio) {
        changes.bio = { from: profile.bio, to: parsed.data.bio };
      }
      if (parsed.data.githubUrl !== profile.githubUrl) {
        changes.githubUrl = { from: profile.githubUrl, to: parsed.data.githubUrl };
      }
      if (parsed.data.websiteUrl !== profile.websiteUrl) {
        changes.websiteUrl = { from: profile.websiteUrl, to: parsed.data.websiteUrl };
      }

      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'DEVELOPER_PROFILE_UPDATED',
        details: JSON.stringify({ profileId: profile.id, changes }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    redirect('/developer/profile');
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/developer/profile"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </Link>
      </div>

      <div className="max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <CodeIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Entwicklerprofil bearbeiten
            </h1>
            <p className="text-zinc-400 mt-1">
              Aktualisiere deine Entwicklerinformationen
            </p>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : null}

        <form action={updateProfile} className="mt-8 space-y-6">
          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Anzeigename <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  placeholder="Max Mustermann"
                  required
                  maxLength={100}
                  defaultValue={profile.displayName}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Bio (optional)
              </label>
              <textarea
                id="bio"
                name="bio"
                placeholder="Erzähle etwas über dich..."
                maxLength={1000}
                rows={4}
                defaultValue={profile.bio ?? ''}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors resize-none"
              />
              <p className="text-xs text-zinc-500 mt-1">Maximal 1000 Zeichen</p>
            </div>

            {/* GitHub URL */}
            <div>
              <label htmlFor="githubUrl" className="block text-sm font-medium text-zinc-300 mb-1.5">
                GitHub-Profil (optional)
              </label>
              <div className="relative">
                <GlobeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="url"
                  id="githubUrl"
                  name="githubUrl"
                  placeholder="https://github.com/benutzername"
                  defaultValue={profile.githubUrl ?? ''}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
                />
              </div>
            </div>

            {/* Website URL */}
            <div>
              <label htmlFor="websiteUrl" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Website (optional)
              </label>
              <div className="relative">
                <GlobeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="url"
                  id="websiteUrl"
                  name="websiteUrl"
                  placeholder="https://deine-website.de"
                  defaultValue={profile.websiteUrl ?? ''}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link
              href="/developer/profile"
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Abbrechen
            </Link>
            <Button
              type="submit"
              size="md"
              className="inline-flex items-center gap-2"
            >
              <CheckIcon className="h-4 w-4" />
              Änderungen speichern
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
