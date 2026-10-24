import Link from 'next/link';
import { requireAdminSession } from '@/lib/server-auth';
import NewsForm from '@/components/dashboard/NewsForm';
import { createNewsAction } from '@/app/(admin)/admin/actions';
import { ArrowLeftIcon } from '@/components/ui/icons';

export default async function CreateNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireAdminSession();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/news"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück zur News-Verwaltung
      </Link>

      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">Neuer News-Artikel</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Der Artikel wird als Entwurf gespeichert und erst nach dem Veröffentlichen sichtbar.
        </p>

        <NewsForm
          action={createNewsAction}
          mode="create"
          cancelHref="/admin/news"
          error={error ?? null}
        />
      </div>
    </div>
  );
}
