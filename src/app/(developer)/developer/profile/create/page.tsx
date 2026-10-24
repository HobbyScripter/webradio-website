import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerAuthSession } from '@/lib/server-auth';
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

export default async function CreateDeveloperProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireDeveloperSession();

  // Check if user already has a developer profile
  const existingProfile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (existingProfile) {
    redirect('/developer/profile');
  }

  // Handle form submission
  async function createProfile(formData: FormData) {
    'use server';

    const user = await requireDeveloperSession();

    // Check if user already has a profile (race condition protection)
    const existing = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (existing) {
      redirect('/developer/profile');
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
        `/developer/profile/create?error=${encodeURIComponent(
          parsed.error.issues.map((i) => i.message).join(', '),
        )}`,
      );
    }

    const profile = await db.orm.public.DeveloperProfile.create({
      userId: user.id,
      displayName: parsed.data.displayName,
      bio: parsed.data.bio ?? null,
      githubUrl: parsed.data.githubUrl ?? null,
      websiteUrl: parsed.data.websiteUrl ?? null,
    });

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'DEVELOPER_PROFILE_CREATED',
        details: JSON.stringify({ profileId: profile.id, displayName: profile.displayName }),
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
          href="/developer"
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
              Entwicklerprofil erstellen
            </h1>
            <p className="text-zinc-400 mt-1">
              Erstelle dein Entwicklerprofil, um Plugins und Themes einzureichen
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

        <form action={createProfile} className="mt-8 space-y-6">
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link
              href="/developer"
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
              Entwicklerprofil erstellen
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
