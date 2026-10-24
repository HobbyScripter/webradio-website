/**
 * @jest-environment node
 */
import {
  GITHUB_REPOSITORY,
  GitHubError,
  __resetGitHubCacheForTests,
  extractReadmeExcerpt,
  getReadme,
  getReleases,
  getRepository,
} from '../github';

const repositoryPayload = {
  full_name: GITHUB_REPOSITORY,
  html_url: 'https://github.com/YourEliteSystems/WebRadio',
  description: 'Cross-platform open-source desktop radio player',
  default_branch: 'main',
  homepage: 'https://webradio.readthedocs.io/de/latest/',
  topics: ['internet-radio', 'electron', 'themes'],
  archived: false,
  pushed_at: '2026-10-17T18:00:00Z',
  license: {
    name: 'Apache License 2.0',
    spdx_id: 'Apache-2.0',
    url: 'https://api.github.com/licenses/apache-2.0',
  },
};

function asset(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    size: 12345,
    state: 'uploaded',
    digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: `https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/${name}`,
    ...overrides,
  };
}

function release(
  tagName: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    tag_name: tagName,
    name: `WebRadio ${tagName}`,
    html_url: `https://github.com/YourEliteSystems/WebRadio/releases/tag/${tagName}`,
    body: `## Änderungen\n\n- Eintrag für ${tagName}`,
    draft: false,
    prerelease: tagName.includes('-'),
    published_at: '2026-09-18T18:49:43Z',
    assets: [
      asset(`WebRadio-${tagName}-win-x64.exe`),
      asset(`WebRadio-${tagName}-linux-x86_64.AppImage`),
      asset(`webradio-${tagName}-1-x86_64.pkg.tar.zst`),
      asset('latest.yml'),
      asset(`WebRadio-${tagName}-win-x64.exe.blockmap`),
      asset('SHA256SUMS.txt'),
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const originalFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  __resetGitHubCacheForTests();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('repository metadata', () => {
  it('returns validated metadata for the official WebRadio repository', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(repositoryPayload));

    const result = await getRepository();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.github.com/repos/YourEliteSystems/WebRadio',
    );
    expect(result.data).toMatchObject({
      fullName: 'YourEliteSystems/WebRadio',
      htmlUrl: 'https://github.com/YourEliteSystems/WebRadio',
      defaultBranch: 'main',
      license: { spdxId: 'Apache-2.0' },
    });
    expect(result.stale).toBe(false);
  });

  it('rejects a response for a different repository (product boundary)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...repositoryPayload,
        full_name: 'someone/other-app',
        html_url: 'https://github.com/someone/other-app',
      }),
    );

    await expect(getRepository()).rejects.toMatchObject({
      code: 'GITHUB_PRODUCT_MISMATCH',
    });
  });

  it('rejects an archived repository', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...repositoryPayload, archived: true }),
    );

    await expect(getRepository()).rejects.toMatchObject({
      code: 'GITHUB_PRODUCT_MISMATCH',
    });
  });
});

describe('releases', () => {
  it('separates stable, beta and alpha releases and returns real assets only', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        release('v1.0.7-beta.2', { published_at: '2026-10-17T18:08:22Z' }),
        release('v1.0.7-alpha.5', { published_at: '2026-09-29T18:39:45Z' }),
        release('v1.0.6', { prerelease: false, published_at: '2026-09-18T18:49:43Z' }),
      ]),
    );

    const result = await getReleases();

    expect(result.data.map((entry) => entry.channel)).toEqual([
      'beta',
      'alpha',
      'stable',
    ]);
    expect(result.data[0]?.tagName).toBe('v1.0.7-beta.2');

    const stable = result.data.find((entry) => entry.tagName === 'v1.0.6');
    expect(stable?.assets.map((entry) => entry.platform).sort()).toEqual([
      'arch',
      'linux',
      'windows',
    ]);
    expect(stable?.assets.every((entry) => entry.downloadUrl.startsWith(
      'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/',
    ))).toBe(true);
    expect(stable?.assets.map((entry) => entry.name)).not.toContain('latest.yml');
    expect(stable?.assets.map((entry) => entry.name)).not.toContain('SHA256SUMS.txt');
  });

  it('never exposes drafts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        release('v1.0.8-draft', { draft: true }),
        release('v1.0.6', { prerelease: false }),
      ]),
    );

    const result = await getReleases();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.tagName).toBe('v1.0.6');
  });

  it('rejects assets from foreign hosts and incomplete uploads', async () => {
    const unsafe = release('v1.0.6', {
      prerelease: false,
      assets: [
        asset('WebRadio-1.0.6-win-x64.exe', {
          browser_download_url: 'https://evil.example/WebRadio-1.0.6-win-x64.exe',
        }),
        asset('WebRadio-1.0.6-linux-x86_64.AppImage', {
          browser_download_url:
            'https://github.com/SomeoneElse/App/releases/download/v1.0.6/WebRadio.AppImage',
        }),
        asset('WebRadio-1.0.6.pkg.tar.zst', { state: 'starter' }),
        asset('WebRadio-1.0.6-valid.exe'),
      ],
    });

    fetchMock.mockResolvedValueOnce(jsonResponse([unsafe]));

    const result = await getReleases();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.assets.map((entry) => entry.name)).toEqual([
      'WebRadio-1.0.6-valid.exe',
    ]);
  });

  it('drops a release whose HTML URL points at a different tag', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        release('v1.0.6', {
          prerelease: false,
          html_url:
            'https://github.com/YourEliteSystems/WebRadio/releases/tag/other',
        }),
      ]),
    );

    const result = await getReleases();

    expect(result.data).toEqual([]);
  });

  it('returns an empty list when GitHub has no published releases', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    const result = await getReleases();

    expect(result.data).toEqual([]);
    expect(result.stale).toBe(false);
  });

  it('surfaces rate limits without leaking response details', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { message: 'API rate limit exceeded for 203.0.113.7' },
        403,
        { 'x-ratelimit-remaining': '0', 'retry-after': '42' },
      ),
    );

    const error = await getReleases().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ code: 'GITHUB_RATE_LIMITED', retryAfterSeconds: 42 });
    expect(String((error as Error).message)).not.toContain('203.0.113.7');
  });

  it('maps a timeout to a stable error code', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    );

    await expect(getReleases()).rejects.toMatchObject({ code: 'GITHUB_TIMEOUT' });
  });

  it('rejects an unreadable payload and a payload with the wrong shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(getReleases()).rejects.toMatchObject({
      code: 'GITHUB_INVALID_RESPONSE',
    });

    __resetGitHubCacheForTests();
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    await expect(getReleases()).rejects.toMatchObject({
      code: 'GITHUB_INVALID_RESPONSE',
    });
  });

  it('uses a fresh cache entry without a second GitHub request', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([release('v1.0.6', { prerelease: false })]),
    );

    await getReleases();
    const second = await getReleases();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.stale).toBe(false);
    expect(second.data).toHaveLength(1);
  });

  it('serves a bounded stale fallback when GitHub becomes unavailable', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const base = 1_790_000_000_000;
    nowSpy.mockReturnValue(base);
    fetchMock.mockResolvedValueOnce(
      jsonResponse([release('v1.0.6', { prerelease: false })]),
    );

    const first = await getReleases();
    expect(first.stale).toBe(false);

    // Six minutes later the cache is expired and GitHub fails.
    nowSpy.mockReturnValue(base + 6 * 60 * 1000);
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const fallback = await getReleases();

    expect(fallback.stale).toBe(true);
    expect(fallback.data).toEqual(first.data);
    expect(fallback.data[0]?.tagName).toBe('v1.0.6');

    nowSpy.mockRestore();
  });

  it('does not serve a fallback older than 24 hours', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const base = 1_790_000_000_000;
    nowSpy.mockReturnValue(base);
    fetchMock.mockResolvedValueOnce(
      jsonResponse([release('v1.0.6', { prerelease: false })]),
    );
    await getReleases();

    nowSpy.mockReturnValue(base + 25 * 60 * 60 * 1000);
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(getReleases()).rejects.toMatchObject({
      code: 'GITHUB_UNAVAILABLE',
    });

    nowSpy.mockRestore();
  });
});

describe('README excerpt', () => {
  it('strips badges, images, HTML and link targets before rendering', () => {
    const excerpt = extractReadmeExcerpt(
      '# 📻 WebRadio\n\n' +
        '[![Version](https://img.shields.io/badge.svg)](https://example.com)\n\n' +
        '> **ONE WORLD. ONE SIGNAL.**\n>\n' +
        '> WebRadio vereint die Suche nach Sendern aus aller Welt, Favoriten und eine anpassbare Oberfläche in einer quelloffenen Anwendung für Windows und Linux.\n\n' +
        '<script>alert(1)</script>\n\n' +
        '[Offizielle Docs](https://example.com/docs)',
    );

    expect(excerpt).toContain('ONE WORLD. ONE SIGNAL.');
    expect(excerpt).toContain('WebRadio vereint');
    expect(excerpt).not.toContain('<script>');
    expect(excerpt).not.toContain('https://example.com');
    expect(excerpt).not.toContain('img.shields.io');
    expect(excerpt).not.toContain('**');
  });

  it('keeps link labels while removing their targets', () => {
    const excerpt = extractReadmeExcerpt(
      'WebRadio ist ein Internetradio-Player. Mehr dazu in der [Offiziellen Dokumentation](https://example.com/docs).',
    );

    expect(excerpt).toContain('Offiziellen Dokumentation');
    expect(excerpt).not.toContain('https://example.com');
  });

  it('returns the README excerpt from a raw GitHub response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(`# WebRadio\n\n${'WebRadio ist ein quelloffener Internetradio-Player für Windows und Linux mit Plugins und Themes. '.repeat(2)}`, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const readme = await getReadme();

    expect(readme).not.toBeNull();
    expect(readme?.excerpt).toContain('WebRadio ist ein quelloffener');
    expect(readme?.htmlUrl).toBe(
      'https://github.com/YourEliteSystems/WebRadio#readme',
    );
  });
});
