/**
 * Helpers for the public read-only API.
 *
 * Responses are cacheable for a short time (the catalogue changes rarely) and
 * never include internal error details.
 */
import { NextResponse } from 'next/server';
import {
  catalogQuerySchema,
  type CatalogQuery,
} from './catalog-query';

export const PUBLIC_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

const NO_STORE = 'no-store';

export function publicJson(
  body: unknown,
  init: { status?: number; cache?: boolean } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      'Cache-Control': init.cache === false ? NO_STORE : PUBLIC_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export type CatalogQueryResult =
  | { ok: true; query: CatalogQuery }
  | { ok: false; response: NextResponse };

/**
 * Strict parser for API routes. Unlike the page parser it rejects invalid
 * values instead of silently falling back to defaults.
 */
export function parseCatalogRequest(url: URL): CatalogQueryResult {
  const parsed = catalogQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fields[key]) {
        fields[key] = issue.message;
      }
    }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'INVALID_QUERY',
          message: 'Ungültige Abfrageparameter.',
          fields,
        },
        {
          status: 400,
          headers: {
            'Cache-Control': NO_STORE,
            'X-Content-Type-Options': 'nosniff',
          },
        },
      ),
    };
  }

  return { ok: true, query: parsed.data };
}
