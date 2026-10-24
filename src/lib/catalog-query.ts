/**
 * Catalogue query parsing shared by pages and public API routes.
 *
 * Kept free of database imports so it can be unit-tested without PostgreSQL.
 */
import { z } from 'zod';

export const PAGE_SIZE = 9;

export const CATALOG_SORTS = ['newest', 'name', 'downloads'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

const pageSchema = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? 1 : value),
  z.coerce.number().int().min(1).max(500),
);

const querySchema = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : (value ?? '')),
  z.string().trim().max(80),
);

const sortSchema = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? 'newest' : value),
  z.enum(CATALOG_SORTS),
);

export const catalogQuerySchema = z.object({
  q: querySchema,
  sort: sortSchema,
  page: pageSchema,
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export type RawCatalogParams = {
  q?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  page?: string | string[] | undefined;
};

/**
 * Lenient parser for page rendering: invalid values fall back to defaults so a
 * hand-edited URL never produces an error page.
 */
export function parseCatalogQuery(params: RawCatalogParams): CatalogQuery {
  const parsed = catalogQuerySchema.safeParse({
    q: params.q,
    sort: params.sort,
    page: params.page,
  });

  return parsed.success ? parsed.data : { q: '', sort: 'newest', page: 1 };
}

export function pageOffset(page: number, pageSize: number = PAGE_SIZE): number {
  return (page - 1) * pageSize;
}

export function hasNextPage(fetchedRowCount: number, pageSize: number = PAGE_SIZE): boolean {
  return fetchedRowCount > pageSize;
}

/** Build a catalogue URL while preserving search/sort and dropping defaults. */
export function buildCatalogHref(
  path: string,
  query: Pick<CatalogQuery, 'q' | 'sort'>,
  overrides: Partial<Pick<CatalogQuery, 'q' | 'sort' | 'page'>> = {},
): string {
  const next = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (next.q) {
    params.set('q', next.q);
  }
  if (next.sort && next.sort !== 'newest') {
    params.set('sort', next.sort);
  }
  if (next.page && next.page > 1) {
    params.set('page', String(next.page));
  }

  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}
