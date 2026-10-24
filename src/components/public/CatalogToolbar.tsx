import Link from 'next/link';
import type { CatalogQuery } from '@/lib/catalog-query';
import { SearchIcon } from '@/components/ui/icons';
import { buttonStyles } from '@/components/ui/button';

export default function CatalogToolbar({
  action,
  query,
  idPrefix,
  placeholder,
}: {
  action: string;
  query: CatalogQuery;
  idPrefix: string;
  placeholder: string;
}) {
  const hasFilters = query.q.length > 0 || query.sort !== 'newest';

  return (
    <form
      action={action}
      method="get"
      role="search"
      className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 sm:flex-row sm:items-center"
    >
      <div className="relative flex-1">
        <label htmlFor={`${idPrefix}-q`} className="sr-only">
          Katalog durchsuchen
        </label>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          id={`${idPrefix}-q`}
          name="q"
          type="search"
          defaultValue={query.q}
          maxLength={80}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-[#0b0b10] py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={`${idPrefix}-sort`} className="sr-only">
          Sortierung
        </label>
        <select
          id={`${idPrefix}-sort`}
          name="sort"
          defaultValue={query.sort}
          className="rounded-xl border border-white/10 bg-[#0b0b10] px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        >
          <option value="newest">Neueste zuerst</option>
          <option value="name">Name (A–Z)</option>
          <option value="downloads">Meiste Downloads</option>
        </select>

        <button type="submit" className={buttonStyles('secondary', 'sm', 'shrink-0')}>
          Anwenden
        </button>

        {hasFilters ? (
          <Link
            href={action}
            className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Zurücksetzen
          </Link>
        ) : null}
      </div>
    </form>
  );
}
