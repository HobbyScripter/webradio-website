import Link from 'next/link';
import { ArrowRightIcon } from '@/components/ui/icons';
import { buildCatalogHref, type CatalogQuery } from '@/lib/catalog-query';

export default function CatalogPagination({
  basePath,
  query,
  hasNext,
}: {
  basePath: string;
  query: CatalogQuery;
  hasNext: boolean;
}) {
  if (query.page === 1 && !hasNext) {
    return null;
  }

  return (
    <nav
      aria-label="Seitennavigation"
      className="mt-10 flex items-center justify-between border-t border-white/[0.07] pt-6"
    >
      {query.page > 1 ? (
        <Link
          href={buildCatalogHref(basePath, query, { page: query.page - 1 })}
          rel="prev"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
        >
          <ArrowRightIcon className="h-4 w-4 rotate-180" /> Zurück
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <span className="text-xs text-zinc-500">Seite {query.page}</span>

      {hasNext ? (
        <Link
          href={buildCatalogHref(basePath, query, { page: query.page + 1 })}
          rel="next"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
        >
          Weiter <ArrowRightIcon className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
