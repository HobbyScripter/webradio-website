import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import CatalogEntryEditor from '@/components/dashboard/CatalogEntryEditor';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

export default async function EditThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; updated?: string; resubmitted?: string }>;
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

  const success = query.resubmitted
    ? 'Gespeichert. Der Eintrag wurde erneut zur Moderation eingereicht.'
    : query.updated
      ? 'Änderungen gespeichert.'
      : null;

  return (
    <CatalogEntryEditor
      kind="THEME"
      mode="edit"
      status={theme.status}
      initial={{
        id: theme.id,
        slug: theme.slug,
        name: theme.name,
        description: theme.description,
      }}
      error={query.error ?? null}
      success={success}
    />
  );
}
