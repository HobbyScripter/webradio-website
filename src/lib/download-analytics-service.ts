import 'temporal-polyfill/global';
import { z } from 'zod';
import type * as DbModule from './db';
import { GITHUB_REPOSITORY, getInstallationAccessToken } from './github-app';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('./db');
  return mod.db;
}

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'webradio-website/0.1 (+https://github.com/YourEliteSystems/WebRadio)';

const apiAssetSchema = z.object({
  id: z.number(),
  name: z.string(),
  size: z.number(),
  state: z.string().optional(),
  download_count: z.number(),
  browser_download_url: z.string(),
});

const apiReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable().optional(),
  assets: z.array(apiAssetSchema),
});

const apiReleasesSchema = z.array(apiReleaseSchema);

export type SyncResult = {
  success: boolean;
  syncedAssetsCount: number;
  totalGitHubDownloads: number;
  error?: string;
  durationMs: number;
};

function channelFor(tagName: string, prerelease: boolean): 'stable' | 'beta' | 'alpha' {
  if (!prerelease) return 'stable';
  return tagName.toLowerCase().includes('alpha') ? 'alpha' : 'beta';
}

function detectPlatform(name: string): { platform: string; format: string } {
  if (/\.AppImage$/i.test(name)) return { platform: 'linux', format: 'AppImage' };
  if (/\.pkg\.tar\.zst$/i.test(name)) return { platform: 'arch', format: 'Arch-Paket (.pkg.tar.zst)' };
  if (/\.deb$/i.test(name)) return { platform: 'debian', format: 'Debian-Paket (.deb)' };
  if (/\.exe$/i.test(name)) return { platform: 'windows', format: 'Installer (EXE)' };
  if (/\.dmg$/i.test(name)) return { platform: 'macos', format: 'Disk Image (.dmg)' };
  return { platform: 'unknown', format: 'Unknown' };
}

/**
 * Normalizes a date or Instant into a UTC day instant (00:00:00.000Z)
 */
export function getUtcDayInstant(date: Date = new Date()): Temporal.Instant {
  const isoDate = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return Temporal.Instant.from(`${isoDate}T00:00:00.000Z`);
}

/**
 * Core synchronization of GitHub release download numbers.
 * Single-runner safe: acquires a lock in DownloadSyncLog.
 */
export async function syncGitHubDownloadStats(options: { force?: boolean } = {}): Promise<SyncResult> {
  const startTime = Date.now();
  const db = await getDb();

  // Check if a sync is currently running (with a 5-minute timeout window for crashed runs)
  const fiveMinutesAgo = Temporal.Now.instant().subtract({ minutes: 5 });
  const runningSync = await db.orm.public.DownloadSyncLog
    .where({ status: 'RUNNING' })
    .where((log) => log.startedAt.gt(fiveMinutesAgo))
    .all();

  if (runningSync.length > 0 && !options.force) {
    return {
      success: false,
      syncedAssetsCount: 0,
      totalGitHubDownloads: 0,
      error: 'Ein Synchronisierungslauf wird bereits ausgeführt.',
      durationMs: Date.now() - startTime,
    };
  }

  // Create lock log
  const syncLog = await db.orm.public.DownloadSyncLog.create({
    status: 'RUNNING',
    startedAt: Temporal.Now.instant(),
  });

  try {
    const auth = await getInstallationAccessToken();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    // Pagination: Fetch up to 100 releases
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPOSITORY}/releases?per_page=100`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`GitHub API antwortete mit Status ${response.status}`);
    }

    const rawData = await response.json();
    const parsed = apiReleasesSchema.safeParse(rawData);
    if (!parsed.success) {
      throw new Error('Ungültiges Antwortformat der GitHub Releases API.');
    }

    let syncedAssetsCount = 0;
    let totalGitHubDownloads = 0;
    const nowInstant = Temporal.Now.instant();
    const todaySnapshotDate = getUtcDayInstant();

    for (const rel of parsed.data) {
      if (rel.draft || !rel.published_at) continue;
      const channel = channelFor(rel.tag_name, rel.prerelease);

      for (const asset of rel.assets) {
        if (asset.state && asset.state !== 'uploaded') continue;
        const { platform, format } = detectPlatform(asset.name);

        totalGitHubDownloads += asset.download_count;
        syncedAssetsCount++;

        const githubAssetId = BigInt(asset.id);
        const existing = await db.orm.public.GitHubReleaseAsset.first({ githubAssetId });

        let assetRecordId: string;
        if (existing) {
          assetRecordId = existing.id;
          await db.orm.public.GitHubReleaseAsset.where({ id: existing.id }).update({
            currentDownloadCount: asset.download_count,
            lastSyncedAt: nowInstant,
            size: BigInt(asset.size),
            downloadUrl: asset.browser_download_url,
          });
        } else {
          const created = await db.orm.public.GitHubReleaseAsset.create({
            githubAssetId,
            releaseId: BigInt(rel.id),
            releaseTag: rel.tag_name,
            releaseChannel: channel,
            fileName: asset.name,
            platform,
            format,
            size: BigInt(asset.size),
            downloadUrl: asset.browser_download_url,
            currentDownloadCount: asset.download_count,
            lastSyncedAt: nowInstant,
          });
          assetRecordId = created.id;
        }

        // Snapshot for today (record/upsert)
        const existingSnapshot = await db.orm.public.GitHubDownloadSnapshot.first({
          assetId: assetRecordId,
          snapshotDate: todaySnapshotDate,
        });

        if (existingSnapshot) {
          await db.orm.public.GitHubDownloadSnapshot
            .where({ id: existingSnapshot.id })
            .update({ downloadCount: asset.download_count });
        } else {
          await db.orm.public.GitHubDownloadSnapshot.create({
            assetId: assetRecordId,
            downloadCount: asset.download_count,
            snapshotDate: todaySnapshotDate,
          });
        }
      }
    }

    // Mark sync log as success
    await db.orm.public.DownloadSyncLog.where({ id: syncLog.id }).update({
      status: 'SUCCESS',
      completedAt: Temporal.Now.instant(),
      syncedAssetsCount,
      totalGitHubDownloads,
    });

    return {
      success: true,
      syncedAssetsCount,
      totalGitHubDownloads,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler bei GitHub Synchronisierung';
    await db.orm.public.DownloadSyncLog.where({ id: syncLog.id }).update({
      status: 'FAILED',
      completedAt: Temporal.Now.instant(),
      errorMessage: message.slice(0, 500),
    });

    return {
      success: false,
      syncedAssetsCount: 0,
      totalGitHubDownloads: 0,
      error: message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Increment website download counter for an asset and country.
 * Uses daily aggregate: (assetId, countryCode, date).
 */
export async function trackWebsiteDownload(assetRecordId: string, countryCodeInput?: string | null): Promise<void> {
  const db = await getDb();
  let countryCode = (countryCodeInput || 'XX').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    countryCode = 'XX';
  }

  const today = getUtcDayInstant();

  try {
    const existing = await db.orm.public.WebsiteDownloadStat.first({
      assetId: assetRecordId,
      countryCode,
      date: today,
    });

    if (existing) {
      await db.orm.public.WebsiteDownloadStat.where({ id: existing.id }).update({
        count: existing.count + 1,
      });
    } else {
      await db.orm.public.WebsiteDownloadStat.create({
        assetId: assetRecordId,
        countryCode,
        date: today,
        count: 1,
      });
    }
  } catch {
    // Graceful error handling - tracking failure must not prevent download
  }
}

export type DownloadAnalyticsDashboardData = {
  summary: {
    totalGitHubDownloads: number;
    totalWebsiteDownloads: number;
    channelDownloads: {
      stable: number;
      beta: number;
      alpha: number;
    };
    lastSyncedAt: string | null;
    syncStatus: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'NEVER';
    lastSyncError: string | null;
  };
  dailyHistory: {
    date: string;
    gitHubDifference: number;
    websiteDownloads: number;
  }[];
  assets: {
    id: string;
    githubAssetId: string;
    releaseTag: string;
    channel: string;
    fileName: string;
    platform: string | null;
    format: string | null;
    size: number;
    gitHubDownloads: number;
    websiteDownloads: number;
  }[];
  countries: {
    countryCode: string;
    count: number;
    percentage: number;
  }[];
};

/**
 * Calculates historical download numbers and delta difference between successive snapshots.
 * If a counter resets or decreases, difference is cleanly treated as 0 (no negative or invented events).
 */
export async function getDownloadAnalyticsData(daysBack = 30): Promise<DownloadAnalyticsDashboardData> {
  const db = await getDb();

  // 1. Fetch Assets
  const assets = await db.orm.public.GitHubReleaseAsset
    .orderBy((a) => a.releaseTag.desc())
    .all();

  // 2. Fetch Sync Status
  const lastSyncLogs = await db.orm.public.DownloadSyncLog
    .orderBy((l) => l.startedAt.desc())
    .limit(1)
    .all();
  const lastSync = lastSyncLogs[0] ?? null;

  // 3. Fetch Website Download Stats
  const websiteStats = await db.orm.public.WebsiteDownloadStat.all();

  // 4. Fetch Snapshots
  const snapshots = await db.orm.public.GitHubDownloadSnapshot
    .orderBy((s) => s.snapshotDate.asc())
    .all();

  let totalGitHubDownloads = 0;
  const channelDownloads = { stable: 0, beta: 0, alpha: 0 };

  const assetMap = new Map<string, {
    id: string;
    githubAssetId: string;
    releaseTag: string;
    channel: string;
    fileName: string;
    platform: string | null;
    format: string | null;
    size: number;
    gitHubDownloads: number;
    websiteDownloads: number;
  }>();

  for (const a of assets) {
    totalGitHubDownloads += a.currentDownloadCount;
    if (a.releaseChannel === 'stable') channelDownloads.stable += a.currentDownloadCount;
    else if (a.releaseChannel === 'beta') channelDownloads.beta += a.currentDownloadCount;
    else if (a.releaseChannel === 'alpha') channelDownloads.alpha += a.currentDownloadCount;

    assetMap.set(a.id, {
      id: a.id,
      githubAssetId: a.githubAssetId.toString(),
      releaseTag: a.releaseTag,
      channel: a.releaseChannel,
      fileName: a.fileName,
      platform: a.platform,
      format: a.format,
      size: Number(a.size),
      gitHubDownloads: a.currentDownloadCount,
      websiteDownloads: 0,
    });
  }

  let totalWebsiteDownloads = 0;
  const countryMap = new Map<string, number>();
  const dailyWebsiteMap = new Map<string, number>();

  for (const s of websiteStats) {
    totalWebsiteDownloads += s.count;
    countryMap.set(s.countryCode, (countryMap.get(s.countryCode) ?? 0) + s.count);

    const dateKey = s.date.toString().slice(0, 10);
    dailyWebsiteMap.set(dateKey, (dailyWebsiteMap.get(dateKey) ?? 0) + s.count);

    const entry = assetMap.get(s.assetId);
    if (entry) {
      entry.websiteDownloads += s.count;
    }
  }

  // 5. Compute GitHub Daily Differences
  // Group snapshots by asset
  const assetSnapshots = new Map<string, { date: string; count: number }[]>();
  for (const snap of snapshots) {
    const list = assetSnapshots.get(snap.assetId) ?? [];
    list.push({
      date: snap.snapshotDate.toString().slice(0, 10),
      count: snap.downloadCount,
    });
    assetSnapshots.set(snap.assetId, list);
  }

  const dailyGitHubDiff = new Map<string, number>();
  for (const snaps of assetSnapshots.values()) {
    // Sorted by date ascending
    for (let i = 1; i < snaps.length; i++) {
      const prev = snaps[i - 1]!;
      const curr = snaps[i]!;
      const diff = curr.count >= prev.count ? curr.count - prev.count : 0;
      dailyGitHubDiff.set(curr.date, (dailyGitHubDiff.get(curr.date) ?? 0) + diff);
    }
  }

  // Generate date series for daysBack
  const now = new Date();
  const dailyHistory: { date: string; gitHubDifference: number; websiteDownloads: number }[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    dailyHistory.push({
      date: dateStr,
      gitHubDifference: dailyGitHubDiff.get(dateStr) ?? 0,
      websiteDownloads: dailyWebsiteMap.get(dateStr) ?? 0,
    });
  }

  // Country aggregates
  const countries = Array.from(countryMap.entries())
    .map(([countryCode, count]) => ({
      countryCode,
      count,
      percentage: totalWebsiteDownloads > 0 ? Math.round((count / totalWebsiteDownloads) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    summary: {
      totalGitHubDownloads,
      totalWebsiteDownloads,
      channelDownloads,
      lastSyncedAt: lastSync?.startedAt ? lastSync.startedAt.toString() : null,
      syncStatus: (lastSync?.status as DownloadAnalyticsDashboardData['summary']['syncStatus']) ?? 'NEVER',
      lastSyncError: lastSync?.errorMessage ?? null,
    },
    dailyHistory,
    assets: Array.from(assetMap.values()),
    countries,
  };
}

