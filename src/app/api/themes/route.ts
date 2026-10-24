import type { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-response';
import { listPublishedThemes } from '@/lib/catalog';
import { PAGE_SIZE } from '@/lib/catalog-query';
import { parseCatalogRequest, publicJson } from '@/lib/public-api';

/**
 * GET /api/themes
 *
 * Public, read-only. Only entries with isPublished=true AND status=APPROVED
 * are returned; the filter is applied in the data layer.
 */
export async function GET(request: NextRequest) {
  const parsed = parseCatalogRequest(new URL(request.url));
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result = await listPublishedThemes({
      q: parsed.query.q,
      sort: parsed.query.sort,
      page: parsed.query.page,
      pageSize: PAGE_SIZE,
    });

    return publicJson({
      data: result.items,
      pagination: {
        page: parsed.query.page,
        pageSize: PAGE_SIZE,
        hasNext: result.hasNext,
      },
    });
  } catch (error) {
    const response = errorResponse('api.themes', error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
