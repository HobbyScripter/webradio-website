import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import VersionForm from '@/components/dashboard/VersionForm';
import CatalogStatusBadge from '@/components/dashboard/CatalogStatusBadge';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { createThemeVersionAction } from '@/app/(developer)/developer/actions';

export default async function CreateThemeVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const user = await requireDeveloperSession();

  const profile = await db.orm.public.DeveloperProfile.where({ userId: user.id }).first();
  if (!profile) {
    redirect('/developer/profile/create');
  }

  const theme = await db.orm.public.Theme.where({
    slug,
    developerId: profile.id,
  }).first();

  if (!theme) {
    notFound();
  }

  const backHref = `/developer/themes/${theme.slug}`;

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück zum Theme
      </Link>

      <div className="max-w-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Neue Theme-Version</h1>
          <CatalogStatusBadge status={theme.status} />
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Version für <span className="font-medium text-zinc-200">{theme.name}</span>. Nach dem
          Speichern kannst du das Theme zur Moderation einreichen.
        </p>

        <VersionForm
          action={createThemeVersionAction}
          kindLabel="Theme"
          entryId={theme.id}
          slug={theme.slug}
          cancelHref={backHref}
          error={query.error ?? null}
        />
      </div>
    </div>
  );
}
