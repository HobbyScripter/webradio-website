import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/server-auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { listAdminNews } from '@/lib/news-service';
import { ButtonLink } from '@/components/ui/button';
import DangerActionForm from '@/components/dashboard/DangerActionForm';
import {
  deleteNewsAction,
  setNewsPublishedAction,
} from '@/app/(admin)/admin/actions';
import {
  NewsIcon,
  PlusIcon,
  EyeIcon,
  PencilIcon,
  SearchIcon,
  CheckIcon,
} from '@/components/ui/icons';

// Session-guarded page: renders on demand instead of being prerendered.
export const instant = false;

const STATUS_TABS = [
  { key: 'all', label: 'Alle' },
  { key: 'published', label: 'Veröffentlicht' },
  { key: 'draft', label: 'Entwürfe' },
] as const;

async function NewsContent({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string; [key: string]: string | undefined }>;
}) {
  await requireAdminSession();
  const query = await searchParams;
  const status = query.status === 'published' || query.status === 'draft' ? query.status : 'all';
  const search = query.search ?? '';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const pageSize = 10;

  const result = await listAdminNews({ search, status, page, pageSize });
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  const notices: Record<string, { message: string; tone: 'success' | 'error' }> = {
    deleted: { message: 'Artikel gelöscht.', tone: 'success' },
    error: {
      message: query.error ?? 'Die Aktion ist fehlgeschlagen.',
      tone: 'error',
    },
  };
  const notice = Object.keys(notices).find((key) => query[key]);

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    if (nextPage > 1) params.set('page', String(nextPage));
    const suffix = params.toString();
    return suffix ? `/admin/news?${suffix}` : '/admin/news';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <NewsIcon className="h-6 w-6" />
            News-Verwaltung
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Erstelle, bearbeite, veröffentliche und ziehe News-Artikel zurück.
          </p>
        </div>
        <ButtonLink href="/admin/news/create" size="sm" className="inline-flex items-center gap-2">
          <PlusIcon className="h-4 w-4" />
          Neuer Artikel
        </ButtonLink>
      </div>

      {notice ? (
        <p
          role={notices[notice]!.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            notices[notice]!.tone === 'error'
              ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-200'
              : 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200'
          }`}
        >
          {notices[notice]!.message}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-white">{result.total}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Gefilterte Artikel</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-emerald-400">{result.published}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Veröffentlicht</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
          <div className="text-lg font-bold text-amber-400">{result.draft}</div>
          <div className="mt-0.5 text-xs text-zinc-500">Entwürfe</div>
        </div>
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center" role="search">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <label htmlFor="news-search" className="sr-only">
            News durchsuchen
          </label>
          <input
            id="news-search"
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Suche nach Titel..."
            className="w-full rounded-xl border border-white/10 bg-[#07070a] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
        <button
          type="submit"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          Suchen
        </button>
      </form>

      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.key;
          const href =
            tab.key === 'all'
              ? '/admin/news'
              : `/admin/news?status=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border border-rose-500/20 bg-rose-500/10 text-rose-300'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/10 text-violet-400">
            <NewsIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-white">Keine News-Artikel gefunden</h2>
          <p className="mt-2 text-sm text-zinc-400">
            {search || status !== 'all'
              ? 'Keine Artikel passen zu den aktuellen Filterkriterien.'
              : 'Es wurden noch keine Artikel erstellt.'}
          </p>
          <div className="mt-4">
            <ButtonLink href="/admin/news/create" size="sm">
              <PlusIcon className="h-4 w-4" />
              Ersten Artikel erstellen
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
          <table className="w-full text-sm">
            <caption className="sr-only">News-Artikel mit Status</caption>
            <thead className="border-b border-zinc-800 bg-zinc-800/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Titel
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Veröffentlicht am
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktualisiert
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {result.items.map((article) => (
                <tr key={article.id} className="transition-colors hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/admin/news/${article.slug}/edit`} className="group">
                      <div className="font-semibold text-white group-hover:text-violet-400">
                        {article.title}
                      </div>
                      <div className="text-xs text-zinc-500">{article.slug}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {article.isPublished ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                        <CheckIcon className="h-3 w-3" />
                        Veröffentlicht
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
                        Entwurf
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {article.publishedAt ? formatDate(article.publishedAt) ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {formatDateTime(article.updatedAt) ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {article.isPublished ? (
                        <Link
                          href={`/news/${article.slug}`}
                          target="_blank"
                          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                          aria-label={`${article.title} öffentlich ansehen`}
                        >
                          <EyeIcon className="h-4 w-4" />
                        </Link>
                      ) : null}
                      <Link
                        href={`/admin/news/${article.slug}/edit`}
                        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        aria-label={`${article.title} bearbeiten`}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      {!article.isPublished ? (
                        <form action={setNewsPublishedAction}>
                          <input type="hidden" name="id" value={article.id} />
                          <input type="hidden" name="slug" value={article.slug} />
                          <input type="hidden" name="published" value="true" />
                          <button
                            type="submit"
                            className="rounded-lg p-1.5 text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
                            aria-label={`${article.title} veröffentlichen`}
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                        </form>
                      ) : null}
                      <DangerActionForm
                        action={deleteNewsAction}
                        fields={{ id: article.id, slug: article.slug }}
                        title="Artikel endgültig löschen?"
                        description={`„${article.title}“ wird dauerhaft entfernt.`}
                        confirmLabel="Endgültig löschen"
                        triggerLabel="Löschen"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Seitennavigation" className="flex items-center justify-between pt-4">
          <p className="text-sm text-zinc-500">
            Seite {page} von {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <ButtonLink href={buildHref(page - 1)} size="sm" variant="secondary">
                Zurück
              </ButtonLink>
            ) : null}
            {page < totalPages ? (
              <ButtonLink href={buildHref(page + 1)} size="sm" variant="secondary">
                Weiter
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export default function AdminNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string; [key: string]: string | undefined }>;
}) {
  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-zinc-500">News werden geladen...</div>}
    >
      <NewsContent searchParams={searchParams} />
    </Suspense>
  );
}
