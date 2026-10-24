/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/catalog', () => ({
  listPublishedPlugins: jest.fn(),
  listPublishedThemes: jest.fn(),
  listReleases: jest.fn(),
  listPublishedNews: jest.fn(),
}));

import { GET as getPlugins } from '@/app/api/plugins/route';
import { GET as getThemes } from '@/app/api/themes/route';
import { GET as getReleases } from '@/app/api/releases/route';
import { GET as getNews } from '@/app/api/news/route';
import {
  listPublishedNews,
  listPublishedPlugins,
  listPublishedThemes,
  listReleases,
} from '@/lib/catalog';

const mockPlugins = jest.mocked(listPublishedPlugins);
const mockThemes = jest.mocked(listPublishedThemes);
const mockReleases = jest.mocked(listReleases);
const mockNews = jest.mocked(listPublishedNews);

const plugin = {
  id: 'plugin-1',
  slug: 'alpha',
  name: 'Alpha',
  description: 'Ein Plugin',
  developerName: 'Studio Nord',
  tags: ['audio'],
  downloads: 3,
  latestVersion: '1.0.0',
  updatedAt: '2026-10-24T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/plugins', () => {
  it('passes validated parameters to the data layer and cache headers to the client', async () => {
    mockPlugins.mockResolvedValue({ items: [plugin], hasNext: true });

    const response = await getPlugins(
      new NextRequest('http://localhost/api/plugins?q=radio&sort=name&page=2'),
    );

    expect(response.status).toBe(200);
    expect(mockPlugins).toHaveBeenCalledWith({
      q: 'radio',
      sort: 'name',
      page: 2,
      pageSize: 9,
    });
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const body = await response.json();
    expect(body).toEqual({
      data: [plugin],
      pagination: { page: 2, pageSize: 9, hasNext: true },
    });
    expect(JSON.stringify(body)).not.toMatch(/email|password|token/i);
  });

  it('rejects invalid query parameters without touching the database', async () => {
    const response = await getPlugins(
      new NextRequest('http://localhost/api/plugins?sort=DROP%20TABLE'),
    );

    expect(response.status).toBe(400);
    expect(mockPlugins).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.error).toBe('INVALID_QUERY');
    expect(body.fields.sort).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/SELECT|DROP TABLE|at /);
  });

  it('rejects a search term longer than 80 characters', async () => {
    const response = await getPlugins(
      new NextRequest(`http://localhost/api/plugins?q=${'x'.repeat(81)}`),
    );

    expect(response.status).toBe(400);
    expect(mockPlugins).not.toHaveBeenCalled();
  });

  it('returns a generic 500 and does not leak driver details', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPlugins.mockRejectedValue(
      new Error('relation "Plugin" does not exist; passwordHash=$2b$12$secret'),
    );

    const response = await getPlugins(new NextRequest('http://localhost/api/plugins'));

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const text = await response.text();
    expect(text).not.toMatch(/relation|passwordHash|\$2b\$|Plugin/);
    expect(text).toContain('INTERNAL_ERROR');
  });
});

describe('GET /api/themes', () => {
  it('returns the published theme page with pagination metadata', async () => {
    mockThemes.mockResolvedValue({
      items: [{ ...plugin, id: 'theme-1', slug: 'night', name: 'Night' }],
      hasNext: false,
    });

    const response = await getThemes(new NextRequest('http://localhost/api/themes'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockThemes).toHaveBeenCalledWith({
      q: '',
      sort: 'newest',
      page: 1,
      pageSize: 9,
    });
    expect(body.pagination).toEqual({ page: 1, pageSize: 9, hasNext: false });
  });
});

describe('GET /api/releases', () => {
  it('sanitizes unsafe download URLs and exposes the derived channel', async () => {
    mockReleases.mockResolvedValue([
      {
        id: 'release-1',
        version: '1.0.0-beta.1',
        title: 'Beta',
        description: 'Test',
        releaseDate: '2026-10-24T12:00:00.000Z',
        isLatest: true,
        downloadUrl: 'javascript:alert(1)',
        fileSize: 100,
        checksum: 'abc',
        changelogs: [],
      },
      {
        id: 'release-2',
        version: '1.0.0',
        title: 'Stable',
        description: 'Test',
        releaseDate: '2026-10-23T12:00:00.000Z',
        isLatest: false,
        downloadUrl: 'https://example.com/webradio.zip',
        fileSize: 200,
        checksum: 'def',
        changelogs: [{ category: 'Added', text: 'First release' }],
      },
    ]);

    const response = await getReleases();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].downloadUrl).toBeNull();
    expect(body.data[0].channel).toBe('beta');
    expect(body.data[1].downloadUrl).toBe('https://example.com/webradio.zip');
    expect(body.data[1].channel).toBe('stable');
  });

  it('returns a generic error when releases cannot be read', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReleases.mockRejectedValue(new Error('connection refused at 127.0.0.1:5433'));

    const response = await getReleases();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('connection refused');
  });
});

describe('GET /api/news', () => {
  it('returns only the mapped public article fields', async () => {
    mockNews.mockResolvedValue([
      {
        id: 'news-1',
        slug: 'update',
        title: 'Update',
        summary: 'Kurz',
        content: 'Lang',
        publishedAt: '2026-10-24T12:00:00.000Z',
      },
    ]);

    const response = await getNews();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      {
        id: 'news-1',
        slug: 'update',
        title: 'Update',
        summary: 'Kurz',
        content: 'Lang',
        publishedAt: '2026-10-24T12:00:00.000Z',
      },
    ]);
  });
});
