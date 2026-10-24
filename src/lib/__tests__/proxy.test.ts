/**
 * @jest-environment node
 *
 * Regression tests for the proxy's detail-route 404 handling.
 *
 * The database is mocked: these tests pin down the HTTP behaviour that matters
 * for caching, not the SQL itself (the real publication filters are covered by
 * `db.integration.test.ts`).
 */
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const mockFirst = jest.fn();

jest.mock('@/lib/db', () => {
  const query = {
    select: () => ({ first: mockFirst }),
  };

  return {
    db: {
      orm: {
        public: {
          Plugin: { where: jest.fn(() => query) },
          Theme: { where: jest.fn(() => query) },
          News: { where: jest.fn(() => query) },
        },
      },
    },
  };
});

function request(path: string, method = 'GET'): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method });
}

beforeEach(() => {
  mockFirst.mockReset();
});

describe('proxy: unknown or unpublished detail slug', () => {
  it('returns a real 404 that no browser, CDN or provider cache may store', async () => {
    mockFirst.mockResolvedValue(null);

    const response = await proxy(request('/plugins/never-published'));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('Seite nicht gefunden');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    // A negative answer must not echo the requested slug or any record data.
    expect(html).not.toContain('never-published');
  });

  it('does not render a framework 404 page with a prerender cache header', async () => {
    mockFirst.mockResolvedValue(null);

    const response = await proxy(request('/themes/never-published'));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-nextjs-prerender')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('answers HEAD without a body but with the same cache protections', async () => {
    mockFirst.mockResolvedValue(null);

    const response = await proxy(request('/plugins/never-published', 'HEAD'));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).toBe('');
  });

  it('queries only published, approved WebRadio entries', async () => {
    mockFirst.mockResolvedValue(null);

    await proxy(request('/plugins/never-published'));

    const { db } = await import('@/lib/db');
    expect(db.orm.public.Plugin.where).toHaveBeenCalledWith({
      slug: 'never-published',
      isPublished: true,
      status: 'APPROVED',
      product: 'WEBRADIO',
    });
  });

  it('does not turn a database outage into a cached negative answer', async () => {
    mockFirst.mockRejectedValue(new Error('database unavailable'));

    const response = await proxy(request('/plugins/temporarily-unknown'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('proxy: publishing after a negative lookup', () => {
  it('serves the route as soon as the entry becomes published, with no stale 404', async () => {
    mockFirst.mockResolvedValueOnce(null);

    const before = await proxy(request('/plugins/later-published'));
    expect(before.status).toBe(404);

    mockFirst.mockResolvedValueOnce({ id: 'plugin-1' });
    const after = await proxy(request('/plugins/later-published'));

    expect(after.status).toBe(200);
    expect(after.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('proxy: unrelated routes', () => {
  it('passes non-detail routes through without a 404 response', async () => {
    const response = await proxy(request('/plugins'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mockFirst).not.toHaveBeenCalled();
  });
});
