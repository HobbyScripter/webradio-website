import { redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import CatalogEntryEditor from '@/components/dashboard/CatalogEntryEditor';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

export default async function CreateThemePage({
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

  return <CatalogEntryEditor kind="THEME" mode="create" error={error ?? null} />;
}
