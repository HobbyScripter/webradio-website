import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminSession } from '@/lib/server-auth';
import { formatDateTime } from '@/lib/format';
import { getAdminNewsBySlug } from '@/lib/news-service';
import NewsForm from '@/components/dashboard/NewsForm';
import DangerActionForm from '@/components/dashboard/DangerActionForm';
import {
  deleteNewsAction,
  setNewsPublishedAction,
  updateNewsAction,
} from '@/app/(admin)/admin/actions';
import { ArrowLeftIcon, CheckIcon, EyeIcon } from '@/components/ui/icons';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

const NOTICES: Record<string, string> = {
  created: 'Artikel als Entwurf angelegt.',
  updated: 'Änderungen gespeichert.',
  published: 'Artikel veröffentlicht.',
  unpublished: 'Artikel zurückgezogen und öffentlich nicht mehr erreichbar.',
};

export default async function EditNewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  await requireAdminSession();

  const article = await getAdminNewsBySlug(slug);
  if (!article) {
    notFound();
  }

  const successKey = Object.keys(NOTICES).find((key) => query[key]);
  const success = successKey ? NOTICES[successKey] : null;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/news"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück zur News-Verwaltung
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Artikel bearbeiten</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {article.slug} ·{' '}
            {article.isPublished ? (
              <span className="text-emerald-400">Veröffentlicht</span>
            ) : (
              <span className="text-amber-400">Entwurf</span>
            )}
            {article.publishedAt
              ? ` · veröffentlicht am ${formatDateTime(article.publishedAt) ?? '—'}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {article.isPublished ? (
            <>
              <Link
                href={`/news/${article.slug}`}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <EyeIcon className="h-4 w-4" />
                Öffentliche Seite
              </Link>
              <DangerActionForm
                action={setNewsPublishedAction}
                fields={{ id: article.id, slug: article.slug, published: 'false' }}
                title="Artikel zurückziehen?"
                description="Der Artikel bleibt gespeichert, ist aber sofort nicht mehr über die öffentliche Website oder API erreichbar."
                confirmLabel="Zurückziehen"
                triggerLabel="Zurückziehen"
                tone="amber"
                hideIcon
              />
            </>
          ) : (
            <form action={setNewsPublishedAction}>
              <input type="hidden" name="id" value={article.id} />
              <input type="hidden" name="slug" value={article.slug} />
              <input type="hidden" name="published" value="true" />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <CheckIcon className="h-4 w-4" />
                Veröffentlichen
              </button>
            </form>
          )}

          <DangerActionForm
            action={deleteNewsAction}
            fields={{ id: article.id, slug: article.slug }}
            title="Artikel endgültig löschen?"
            description={`„${article.title}“ wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
            confirmLabel="Endgültig löschen"
          />
        </div>
      </div>

      {success ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {query.error}
        </p>
      ) : null}

      <div className="max-w-3xl">
        <NewsForm
          action={updateNewsAction}
          mode="edit"
          initial={{
            id: article.id,
            slug: article.slug,
            title: article.title,
            summary: article.summary,
            content: article.content,
          }}
          cancelHref="/admin/news"
          error={null}
        />
        <p className="mt-4 text-xs text-zinc-500">
          Änderungen an einem veröffentlichten Artikel sind sofort öffentlich sichtbar.
        </p>
      </div>
    </div>
  );
}
