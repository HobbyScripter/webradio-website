import { errorResponse } from '@/lib/api-response';
import { listPublishedNews } from '@/lib/catalog';
import { publicJson } from '@/lib/public-api';

/**
 * GET /api/news
 *
 * Public, read-only. Only published entries whose publishedAt is in the past
 * are returned; the filter is applied in the data layer.
 */
export async function GET() {
  try {
    const entries = await listPublishedNews(50);

    return publicJson({
      data: entries.map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        title: entry.title,
        summary: entry.summary,
        content: entry.content,
        publishedAt: entry.publishedAt,
      })),
    });
  } catch (error) {
    const response = errorResponse('api.news', error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
