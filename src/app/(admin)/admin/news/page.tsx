import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { ButtonLink, Button } from '@/components/ui/button';
import {
  NewsIcon,
  PlusIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  ClockIcon,
  SearchIcon,
} from '@/components/ui/icons';

async function NewsContent({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; page?: string }> }) {
  const user = await requireAdminSession();
  const { search = '', status = 'all', page = '1' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const perPage = 10;

  // Get news with filtering
  let newsQuery = db.orm.public.News.orderBy((n) => n.createdAt.desc());

  if (status === 'published') {
    newsQuery = newsQuery.where((n) => n.isPublished.eq(true));
  } else if (status === 'draft') {
    newsQuery = newsQuery.where((n) => n.isPublished.eq(false));
  }

  if (search) {
    newsQuery = newsQuery.where((n) =>
      n.title.ilike(`%${search}%`)
    );
  }

  const allNews = await newsQuery.all();
  const totalNews = allNews.length;
  const totalPages = Math.ceil(totalNews / perPage);
  const news = allNews.slice((pageNum - 1) * perPage, pageNum * perPage);

  const counts = {
    all: totalNews,
    published: allNews.filter((n) => n.isPublished).length,
    draft: allNews.filter((n) => !n.isPublished).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <NewsIcon className="h-6 w-6" />
            News-Verwaltung
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Erstelle, bearbeite und verwalte News-Artikel
          </p>
        </div>
        <ButtonLink
          href="/admin/news/create"
          size="sm"
          className="inline-flex items-center gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Neuer Artikel
        </ButtonLink>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-white">{counts.all}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Artikel gesamt</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-emerald-400">{counts.published}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Veröffentlicht</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-amber-400">{counts.draft}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Entwürfe</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            placeholder="Suche nach Titel..."
            defaultValue={search}
            className="w-full rounded-xl border border-white/10 bg-[#07070a] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Link
            href="/admin/news"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'all'
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Alle ({counts.all})
          </Link>
          <Link
            href="/admin/news?status=published"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'published'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Veröffentlicht ({counts.published})
          </Link>
          <Link
            href="/admin/news?status=draft"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'draft'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Entwürfe ({counts.draft})
          </Link>
        </div>
      </div>

      {/* News Table */}
      {news.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto">
            <NewsIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white mt-4">Keine News-Artikel gefunden</h3>
          <p className="text-zinc-400 text-sm mt-2">
            {search || status !== 'all'
              ? 'Keine Artikel passen zu den aktuellen Filterkriterien.'
              : 'Du hast noch keine News-Artikel erstellt.'}
          </p>
          <div className="mt-4">
            <ButtonLink
              href="/admin/news/create"
              size="sm"
            >
              <PlusIcon className="h-4 w-4" />
              Ersten Artikel erstellen
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50 border-b border-zinc-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Titel
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Veröffentlicht
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Datum
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {news.map((article) => (
                <tr key={article.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/news/${article.slug}/edit`}
                      className="group"
                    >
                      <div className="font-semibold text-white group-hover:text-violet-400">
                        {article.title}
                      </div>
                      {article.summary && (
                        <div className="text-xs text-zinc-500 line-clamp-1">{article.summary}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-zinc-400">{article.slug}</code>
                  </td>
                  <td className="px-4 py-3">
                    {article.isPublished ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400">
                        <CheckIcon className="h-3 w-3" />
                        Veröffentlicht
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400">
                        <ClockIcon className="h-3 w-3" />
                        Entwurf
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {article.publishedAt ? (
                      <span className="text-xs text-zinc-400">
                        {new Date(article.publishedAt.toString()).toLocaleDateString('de-DE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500">
                      {new Date(article.createdAt.toString()).toLocaleDateString('de-DE', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/news/${article.slug}`}
                        target="_blank"
                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                        title="Ansehen"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/news/${article.slug}/edit`}
                        className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                        title="Bearbeiten"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      {!article.isPublished && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/5 hover:text-emerald-300"
                          title="Veröffentlichen"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-zinc-500">
            Seite {pageNum} von {totalPages}
          </p>
          <div className="flex gap-1">
            <Link
              href={`/admin/news?page=${Math.max(1, pageNum - 1)}&search=${search}&status=${status}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pageNum <= 1
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Zurück
            </Link>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const pageNumToShow = 
                totalPages <= 7
                  ? i + 1
                  : pageNum <= 4
                    ? i + 1
                    : pageNum >= totalPages - 3
                      ? totalPages - 6 + i
                      : pageNum - 3 + i;

              if (pageNumToShow < 1 || pageNumToShow > totalPages) return null;

              return (
                <Link
                  key={pageNumToShow}
                  href={`/admin/news?page=${pageNumToShow}&search=${search}&status=${status}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    pageNumToShow === pageNum
                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {pageNumToShow}
                </Link>
              );
            })}
            <Link
              href={`/admin/news?page=${Math.min(totalPages, pageNum + 1)}&search=${search}&status=${status}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pageNum >= totalPages
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              Weiter
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          News werden geladen...
        </div>
      }
    >
      <NewsContent searchParams={searchParams} />
    </Suspense>
  );
}
