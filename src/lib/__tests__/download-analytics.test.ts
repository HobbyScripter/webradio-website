/**
 * @jest-environment node
 *
 * Aggregation tests for the download analytics dashboard data.
 * The SQL layer is mocked; the real aggregation code runs.
 */
import { getDownloadAnalyticsData } from '../download-analytics-service';
import * as dbModule from '@/lib/db';

jest.mock('@/lib/db', () => {
  const state: {
    assets: unknown[];
    syncLogs: unknown[];
    websiteStats: unknown[];
    snapshots: unknown[];
    fail: boolean;
  } = {
    assets: [],
    syncLogs: [],
    websiteStats: [],
    snapshots: [],
    fail: false,
  };

  const guard = () => {
    if (state.fail) {
      throw new Error('relation "GitHubReleaseAsset" does not exist');
    }
  };

  return {
    __analyticsState: state,
    db: {
      orm: {
        public: {
          GitHubReleaseAsset: {
            orderBy: () => ({
              all: async () => {
                guard();
                return state.assets;
              },
            }),
          },
          DownloadSyncLog: {
            orderBy: () => ({
              limit: () => ({
                all: async () => {
                  guard();
                  return state.syncLogs;
                },
              }),
            }),
          },
          WebsiteDownloadStat: {
            all: async () => {
              guard();
              return state.websiteStats;
            },
          },
          GitHubDownloadSnapshot: {
            orderBy: () => ({
              all: async () => {
                guard();
                return state.snapshots;
              },
            }),
          },
        },
      },
    },
  };
});

const state = (
  dbModule as unknown as {
    __analyticsState: {
      assets: unknown[];
      syncLogs: unknown[];
      websiteStats: unknown[];
      snapshots: unknown[];
      fail: boolean;
    };
  }
).__analyticsState;

function instant(isoDay: string) {
  return { toString: () => `${isoDay}T00:00:00.000Z` };
}

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const asset = {
  id: 'asset-1',
  githubAssetId: BigInt(443494960),
  releaseId: BigInt(1),
  releaseTag: 'v1.0.8',
  releaseChannel: 'stable',
  fileName: 'WebRadio-1.0.8-win-x64.exe',
  platform: 'windows',
  format: 'Installer (EXE)',
  size: BigInt(1024),
  downloadUrl: 'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.8/x.exe',
  currentDownloadCount: 100,
  lastSyncedAt: instant(today),
};

beforeEach(() => {
  state.assets = [];
  state.syncLogs = [];
  state.websiteStats = [];
  state.snapshots = [];
  state.fail = false;
});

describe('getDownloadAnalyticsData', () => {
  it('returns zeros and empty collections when no data exists', async () => {
    const data = await getDownloadAnalyticsData(30);

    expect(data.summary.totalGitHubDownloads).toBe(0);
    expect(data.summary.totalWebsiteDownloads).toBe(0);
    expect(data.summary.channelDownloads).toEqual({ stable: 0, beta: 0, alpha: 0, rc: 0, unknown: 0 });
    expect(data.summary.syncStatus).toBe('NEVER');
    expect(data.summary.lastSyncedAt).toBeNull();
    expect(data.assets).toEqual([]);
    expect(data.countries).toEqual([]);
    // A complete date series, not an empty/missing table.
    expect(data.dailyHistory).toHaveLength(30);
    expect(data.dailyHistory.every((row) => row.gitHubDifference === 0)).toBe(true);
  });

  it('keeps GitHub counters and website calls separate', async () => {
    state.assets = [asset];
    state.syncLogs = [
      {
        id: 'log-1',
        status: 'SUCCESS',
        startedAt: instant(today),
        errorMessage: null,
      },
    ];
    state.snapshots = [
      { assetId: 'asset-1', snapshotDate: instant(yesterday), downloadCount: 90 },
      { assetId: 'asset-1', snapshotDate: instant(today), downloadCount: 100 },
    ];
    state.websiteStats = [
      { assetId: 'asset-1', countryCode: 'DE', date: instant(today), count: 5 },
      { assetId: 'asset-1', countryCode: 'US', date: instant(today), count: 3 },
    ];

    const data = await getDownloadAnalyticsData(30);

    expect(data.summary.totalGitHubDownloads).toBe(100);
    expect(data.summary.totalWebsiteDownloads).toBe(8);
    expect(data.summary.channelDownloads).toEqual({ stable: 100, beta: 0, alpha: 0, rc: 0, unknown: 0 });
    expect(data.summary.syncStatus).toBe('SUCCESS');
    expect(data.assets).toHaveLength(1);
    expect(data.assets[0]).toMatchObject({
      releaseTag: 'v1.0.8',
      gitHubDownloads: 100,
      websiteDownloads: 8,
    });
    expect(data.countries).toEqual([
      { countryCode: 'DE', count: 5, percentage: 62.5 },
      { countryCode: 'US', count: 3, percentage: 37.5 },
    ]);
    expect(data.dailyHistory.find((row) => row.date === today)).toMatchObject({
      gitHubDifference: 10,
      websiteDownloads: 8,
    });
  });

  it('propagates a database failure so the page can render an error state', async () => {
    state.fail = true;

    await expect(getDownloadAnalyticsData(30)).rejects.toThrow(
      /GitHubReleaseAsset/,
    );
  });
});
