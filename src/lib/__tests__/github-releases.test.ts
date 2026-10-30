/**
 * @jest-environment node
 */
import {
  GitHubReleaseError,
  __resetGitHubReleaseCacheForTests,
  listGitHubReleases,
  tagToVersion,
} from '../github-releases';
import { GitHubRepositoryError } from '../github-repository';

const release = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  tag_name: 'v1.2.3',
  name: 'Version 1.2.3',
  html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
  body: 'Fehler behoben.\n\nNeu: Themes.',
  draft: false,
  prerelease: false,
  published_at: '2026-10-01T10:00:00Z',
  assets: [
    {
      name: 'plugin-1.2.3.zip',
      size: 204_800,
      state: 'uploaded',
      digest: `sha256:${'a'.repeat(64)}`,
      content_type: 'application/zip',
      browser_download_url:
        'https://github.com/owner/repo/releases/download/v1.2.3/plugin-1.2.3.zip',
    },
  ],
  ...overrides,
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

const fetchMock = jest.fn();

beforeEach(() => {
  __resetGitHubReleaseCacheForTests();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  delete process.env['GITHUB_TOKEN'];
});

afterAll(() => {
  delete process.env['GITHUB_TOKEN'];
});

describe('tagToVersion', () => {
  it('maps semver tags to the three-part catalogue version', () => {
    expect(tagToVersion('v1.2.3')).toBe('1.2.3');
    expect(tagToVersion('1.2.3')).toBe('1.2.3');
    expect(tagToVersion('v1.2.3-beta.1')).toBe('1.2.3');
    expect(tagToVersion('v1.2.3+build.4')).toBe('1.2.3');
  });

  it('returns null for tags the catalogue schema would reject', () => {
    expect(tagToVersion('release-2026')).toBeNull();
    expect(tagToVersion('v1.2')).toBeNull();
  });
});

describe('listGitHubReleases', () => {
  it('requests only the fixed GitHub API endpoint for the parsed repository', async () => {
    fetchMock.mockResolvedValue(jsonResponse([release()]));

    await listGitHubReleases('https://github.com/owner/repo/tree/main');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/owner/repo/releases?per_page=50');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('sends the server-side token as a header and never returns it', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token-value';
    fetchMock.mockResolvedValue(jsonResponse([release()]));

    const result = await listGitHubReleases('github.com/owner/repo');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token-value',
    );
    expect(JSON.stringify(result)).not.toContain('test-token-value');
  });

  it('maps releases, flags pre-releases and drops drafts', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        release(),
        release({
          id: 2,
          tag_name: 'v2.0.0-rc.1',
          html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0-rc.1',
          prerelease: true,
          published_at: '2026-10-20T10:00:00Z',
          assets: [],
        }),
        release({
          id: 3,
          tag_name: 'v9.9.9',
          html_url: 'https://github.com/owner/repo/releases/tag/v9.9.9',
          draft: true,
        }),
      ]),
    );

    const result = await listGitHubReleases('https://github.com/owner/repo');

    expect(result.repository).toEqual({
      fullName: 'owner/repo',
      url: 'https://github.com/owner/repo',
    });
    expect(result.stale).toBe(false);
    expect(result.releases).toHaveLength(2);
    // Newest first.
    expect(result.releases[0]?.tagName).toBe('v2.0.0-rc.1');
    expect(result.releases[0]?.isPrerelease).toBe(true);
    expect(result.releases[0]?.assets).toEqual([]);
    expect(result.releases[1]?.tagName).toBe('v1.2.3');
    expect(result.releases[1]?.version).toBe('1.2.3');
    expect(result.releases[1]?.assets[0]).toMatchObject({
      name: 'plugin-1.2.3.zip',
      size: 204_800,
      digest: `sha256:${'a'.repeat(64)}`,
    });
  });

  it('rejects asset and release links from another repository', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        release({
          html_url: 'https://github.com/attacker/repo/releases/tag/v1.2.3',
        }),
        release({
          id: 2,
          assets: [
            {
              name: 'evil.zip',
              size: 10,
              state: 'uploaded',
              browser_download_url:
                'https://github.com/attacker/repo/releases/download/v1.2.3/evil.zip',
            },
          ],
        }),
      ]),
    );

    const result = await listGitHubReleases('https://github.com/owner/repo');

    // The release that points at a foreign repository is dropped entirely; the
    // otherwise valid release keeps its metadata but loses the foreign asset.
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0]?.id).toBe(2);
    expect(result.releases[0]?.assets).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('attacker');
  });

  it('returns an empty list for a repository without releases', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    const result = await listGitHubReleases('https://github.com/owner/repo');

    expect(result.releases).toEqual([]);
  });

  it('reports a missing repository as GITHUB_NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Not Found' }, { status: 404 }));

    await expect(listGitHubReleases('https://github.com/owner/repo')).rejects.toMatchObject({
      code: 'GITHUB_NOT_FOUND',
      message: expect.stringMatching(/Repository nicht gefunden/),
    });
  });

  it('reports rate limiting with the retry delay', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' },
        },
      ),
    );

    const error = await listGitHubReleases('https://github.com/owner/repo').catch((caught) => caught);

    expect(error).toBeInstanceOf(GitHubReleaseError);
    expect((error as GitHubReleaseError).code).toBe('GITHUB_RATE_LIMITED');
    expect((error as GitHubReleaseError).message).toMatch(/limitiert/);
  });

  it('reports an unreachable GitHub as GITHUB_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(listGitHubReleases('https://github.com/owner/repo')).rejects.toMatchObject({
      code: 'GITHUB_UNAVAILABLE',
    });
  });

  it('reports an unexpected payload as GITHUB_INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));

    await expect(listGitHubReleases('https://github.com/owner/repo')).rejects.toMatchObject({
      code: 'GITHUB_INVALID_RESPONSE',
    });
  });

  it('never contacts GitHub for a URL that is not a repository', async () => {
    await expect(listGitHubReleases('https://example.com/owner/repo')).rejects.toBeInstanceOf(
      GitHubRepositoryError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches a successful answer for the same repository', async () => {
    fetchMock.mockResolvedValue(jsonResponse([release()]));

    await listGitHubReleases('https://github.com/owner/repo');
    await listGitHubReleases('https://github.com/Owner/Repo');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a stale snapshot when GitHub fails afterwards', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([release()]));
    const first = await listGitHubReleases('https://github.com/owner/repo');
    expect(first.stale).toBe(false);

    // Expire the cache entry without waiting five minutes.
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000);
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, { status: 500 }));

    const second = await listGitHubReleases('https://github.com/owner/repo');

    expect(second.stale).toBe(true);
    expect(second.releases).toHaveLength(1);
    nowSpy.mockRestore();
  });
});
