import { redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import CatalogEntryEditor from '@/components/dashboard/CatalogEntryEditor';

export default async function CreatePluginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireDeveloperSession();

  const profile = await db.orm.public.DeveloperProfile.where({ userId: user.id }).first();
  if (!profile) {
    redirect('/developer/profile/create');
  }

  return <CatalogEntryEditor kind="PLUGIN" mode="create" error={error ?? null} />;
}
