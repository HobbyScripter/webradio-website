/**
 * @jest-environment node
 *
 * Release asset metadata: content type, state, validated SHA-256 digest and
 * release-level fields. GitHub and the DB layer are mocked.
 */
import { syncGitHubDownloadStats, validAssetDigest } from '../download-analytics-service';
import * as dbModule from '@/lib/db';
import * as githubApp from '@/lib/github-app';

jest.mock('@/lib/github-app', () => ({
  GITHUB_REPOSITORY: 'YourEliteSystems/WebRadio',
  getInstallationAccessToken: jest.fn(),
}));

jest.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;

  const state: {
    existingAsset: Row | null;
    created: Row[];
    updates: Row[];
    snapshots: Row[];
  } = { existingAsset: null, created: [], updates: [], snapshots: [] };

  const lockWhere = {
    where: () => ({ all: async () => [] }),
    all: async () => [],
    update: async () => undefined,
  };

  return {
    __releaseState: state,
    db: {
      orm: {
        public: {
          DownloadSyncLog: {
            create: async (data: Row) => ({ id: 'sync-1', ...data }),
            where: () => lockWhere,
          },
          GitHubReleaseAsset: {
            first: async () => state.existingAsset,
            create: async (data: Row) => {
              state.created.push(data);
              return { id: 'asset-1', ...data };
            },
            where: () => ({
              update: async (data: Row) => {
                state.updates.push(data);
              },
            }),
          },
          GitHubDownloadSnapshot: {
            first: async () => null,
            create: async (data: Row) => {
              state.snapshots.push(data);
            },
          },
        },
      },
    },
  };
});

const state = (
  dbModule as unknown as {
    __releaseState: {
      existingAsset: Record<string, unknown> | null;
      created: Record<string, unknown>[];
      updates: Record<string, unknown>[];
      snapshots: Record<string, unknown>[];
    };
  }
).__releaseState;

const getToken = githubApp.getInstallationAccessToken as jest.MockedFunction<
  typeof githubApp.getInstallationAccessToken
>;

const VALID_DIGEST = `sha256:${'a'.repeat(64)}`;

function release(overrides: Record<string, unknown> = {}) {
  return {
    id: 9001,
    tag_name: 'v2.0.0-beta.1',
    name: 'WebRadio 2.0 Beta',
    draft: false,
    prerelease: true,
    published_at: '2026-11-01T10:00:00Z',
    assets: [
      {
        id: 443494960,
        name: 'WebRadio-2.0.0-win-x64.exe',
        size: 1024,
        state: 'uploaded',
        content_type: 'application/octet-stream',
        digest: VALID_DIGEST,
        download_count: 5,
        browser_download_url:
          'https://github.com/YourEliteSystems/WebRadio/releases/download/v2.0.0-beta.1/WebRadio.exe',
      },
    ],
    ...overrides,
  };
}

function installFetch(body: unknown) {
  global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

beforeEach(() => {
  state.existingAsset = null;
  state.created.length = 0;
  state.updates.length = 0;
  state.snapshots.length = 0;
  getToken.mockResolvedValue({ token: 'installation-token' } as never);
});

describe('validAssetDigest', () => {
  it('accepts a complete sha256 digest case-insensitively', () => {
    expect(validAssetDigest(VALID_DIGEST)).toBe(VALID_DIGEST);
    expect(validAssetDigest(`SHA256:${'B'.repeat(64)}`)).toBe(`SHA256:${'B'.repeat(64)}`);
  });

  it('rejects truncated, foreign or missing digests', () => {
    expect(validAssetDigest('sha256:abc')).toBeNull();
    expect(validAssetDigest(`md5:${'a'.repeat(32)}`)).toBeNull();
    expect(validAssetDigest(null)).toBeNull();
    expect(validAssetDigest(undefined)).toBeNull();
  });
});

describe('syncGitHubDownloadStats metadata', () => {
  it('stores asset metadata and release fields on create', async () => {
    installFetch([release()]);

    const result = await syncGitHubDownloadStats();

    expect(result.success).toBe(true);
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({
      githubAssetId: BigInt(443494960),
      releaseTag: 'v2.0.0-beta.1',
      releaseChannel: 'beta',
      contentType: 'application/octet-stream',
      state: 'uploaded',
      digest: VALID_DIGEST,
      releaseName: 'WebRadio 2.0 Beta',
      isPrerelease: true,
    });
    expect(String(state.created[0].releasePublishedAt)).toBe('2026-11-01T10:00:00Z');
  });

  it('keeps an invalid digest out of the database', async () => {
    installFetch([
      release({
        assets: [
          {
            ...(release().assets as Record<string, unknown>[])[0],
            digest: 'sha256:not-hex',
          },
        ],
      }),
    ]);

    await syncGitHubDownloadStats();

    expect(state.created[0]).toMatchObject({ digest: null });
  });

  it('writes the metadata when an asset already exists', async () => {
    state.existingAsset = { id: 'asset-existing' };
    installFetch([release({ prerelease: false, name: null, tag_name: 'v2.0.0' })]);

    await syncGitHubDownloadStats();

    expect(state.created).toHaveLength(0);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      contentType: 'application/octet-stream',
      state: 'uploaded',
      digest: VALID_DIGEST,
      releaseName: null,
      isPrerelease: false,
    });
    expect(String(state.updates[0].releasePublishedAt)).toBe('2026-11-01T10:00:00Z');
  });

  it('skips drafts and assets that are not fully uploaded', async () => {
    installFetch([
      release({ id: 1, draft: true }),
      release({
        id: 2,
        assets: [
          {
            ...(release().assets as Record<string, unknown>[])[0],
            state: 'starter',
          },
        ],
      }),
    ]);

    const result = await syncGitHubDownloadStats();

    expect(result.success).toBe(true);
    expect(result.syncedAssetsCount).toBe(0);
    expect(state.created).toHaveLength(0);
  });
});
