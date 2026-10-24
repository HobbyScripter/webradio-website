import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import CatalogEntryEditor from '@/components/dashboard/CatalogEntryEditor';

export default async function EditPluginPage({
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

  const plugin = await db.orm.public.Plugin.where({
    slug,
    developerId: profile.id,
  }).first();

  if (!plugin) {
    notFound();
  }

  const success = query.resubmitted
    ? 'Gespeichert. Der Eintrag wurde erneut zur Moderation eingereicht.'
    : query.updated
      ? 'Änderungen gespeichert.'
      : null;

  return (
    <CatalogEntryEditor
      kind="PLUGIN"
      mode="edit"
      status={plugin.status}
      initial={{
        id: plugin.id,
        slug: plugin.slug,
        name: plugin.name,
        description: plugin.description,
      }}
      error={query.error ?? null}
      success={success}
    />
  );
}
