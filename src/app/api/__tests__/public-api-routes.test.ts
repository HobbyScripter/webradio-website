/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/catalog', () => ({
  listPublishedPlugins: jest.fn(),
  listPublishedThemes: jest.fn(),
  listPublishedNews: jest.fn(),
}));

jest.mock('@/lib/github', () => ({
  GitHubError: class GitHubError extends Error {},
  getGitHubSnapshot: jest.fn(),
}));

import { GET as getPlugins } from '@/app/api/plugins/route';
import { GET as getThemes } from '@/app/api/themes/route';
import { GET as getReleases } from '@/app/api/releases/route';
import { GET as getNews } from '@/app/api/news/route';
import {
  listPublishedNews,
  listPublishedPlugins,
  listPublishedThemes,
} from '@/lib/catalog';
import { getGitHubSnapshot } from '@/lib/github';

const mockPlugins = jest.mocked(listPublishedPlugins);
const mockThemes = jest.mocked(listPublishedThemes);
const mockSnapshot = jest.mocked(getGitHubSnapshot);
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
    // Withdrawn content must never be served from a shared cache.
    expect(response.headers.get('Cache-Control')).toBe('no-store');
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
  const stableAsset = {
    name: 'WebRadio-1.0.6-win-x64.exe',
    size: 136641014,
    digest: 'sha256:' + 'a'.repeat(64),
    downloadUrl:
      'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/WebRadio-1.0.6-win-x64.exe',
    platform: 'windows' as const,
    platformLabel: 'Windows (x64)',
    format: 'Installer (EXE)',
  };

  const snapshot = {
    repository: {
      fullName: 'YourEliteSystems/WebRadio',
      htmlUrl: 'https://github.com/YourEliteSystems/WebRadio',
      description: 'Desktop radio player',
      defaultBranch: 'main',
      license: {
        name: 'Apache License 2.0',
        spdxId: 'Apache-2.0',
        url: 'https://api.github.com/licenses/apache-2.0',
      },
      homepage: null,
      topics: ['internet-radio'],
      archived: false,
      pushedAt: '2026-10-17T18:00:00Z',
    },
    releases: [
      {
        id: 1,
        tagName: 'v1.0.6',
        name: 'WebRadio 1.0.6',
        htmlUrl:
          'https://github.com/YourEliteSystems/WebRadio/releases/tag/v1.0.6',
        publishedAt: '2026-09-18T18:49:43Z',
        channel: 'stable' as const,
        isPrerelease: false,
        notes: '## Änderungen\n\n- Stabiler Build',
        assets: [stableAsset],
      },
    ],
    latestStable: null,
    latestBeta: null,
    latestAlpha: null,
    fetchedAt: '2026-10-24T19:00:00.000Z',
    stale: false,
  };

  beforeEach(() => {
    mockSnapshot.mockResolvedValue({
      ...snapshot,
      latestStable: snapshot.releases[0]!,
    });
  });

  it('returns validated GitHub releases, exact asset URLs and source metadata', async () => {
    const response = await getReleases();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      tagName: 'v1.0.6',
      channel: 'stable',
      assets: [{ downloadUrl: stableAsset.downloadUrl, digest: stableAsset.digest }],
    });
    expect(body.latest).toEqual({
      stable: 'v1.0.6',
      beta: null,
      alpha: null,
    });
    expect(body.repository).toMatchObject({
      fullName: 'YourEliteSystems/WebRadio',
      license: { spdxId: 'Apache-2.0' },
    });
    expect(body.source).toEqual({
      provider: 'github',
      fetchedAt: snapshot.fetchedAt,
      stale: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/email|password|token|secret/i);
  });

  it('returns 503 with generic data when GitHub is unavailable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSnapshot.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:443 token=ghp_secret'),
    );

    const response = await getReleases();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(text).toContain('RELEASES_UNAVAILABLE');
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('ghp_secret');
    expect(text).not.toContain('ECONNREFUSED');
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
