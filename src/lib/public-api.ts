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

// Public catalogue responses are deliberately not shared-cacheable. A
// withdrawn entry must disappear on the next request; `s-maxage` plus
// `stale-while-revalidate` could keep it visible for minutes in a CDN. The
// database is the source of truth for publication, so a short server-side
// cache would need a reliable purge hook that this project does not have.
export const PUBLIC_CACHE_CONTROL = 'no-store';

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
