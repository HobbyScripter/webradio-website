import 'temporal-polyfill/global';
import { db } from '@/lib/db';
import { CHANNEL_LABELS, CHANNEL_COLORS, type ReleaseChannel } from './channel';

export { CHANNEL_LABELS, CHANNEL_COLORS };
export type { ReleaseChannel };

export type AnalyticsWindow = 7 | 30 | 90 | 180 | 365;

export function parseAnalyticsWindow(value: string | undefined): AnalyticsWindow {
  if (value === '7') return 7;
  if (value === '90') return 90;
  if (value === '180') return 180;
  if (value === '365') return 365;
  return 30;
}

function windowCutoff(days: AnalyticsWindow): Temporal.Instant {
  return Temporal.Now.instant().subtract({ hours: days * 24 });
}

function dayString(value: unknown): string {
  return String(value).slice(0, 10);
}

export type CountRow = { label: string; count: number };

export function topCounts(rows: Iterable<{ key: string; count: number }>, limit = 10): CountRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.key) continue;
    totals.set(row.key, (totals.get(row.key) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// GitHub traffic
// ---------------------------------------------------------------------------

export type TrafficAnalytics = {
  days: AnalyticsWindow;
  totals: { views: number; uniqueVisitors: number; clones: number; uniqueClones: number };
  daily: {
    day: string;
    views: number;
    uniqueVisitors: number;
    clones: number;
    uniqueClones: number;
  }[];
  referrers: CountRow[];
  paths: CountRow[];
  capturedFor: string | null;
};

export async function getTrafficAnalytics(days: AnalyticsWindow): Promise<TrafficAnalytics> {
  const cutoff = windowCutoff(days);
  const [dailyRows, referrerRows, pathRows] = await Promise.all([
    db.orm.public.GitHubTrafficDaily.all(),
    db.orm.public.GitHubTrafficReferrerSnapshot.orderBy((row) => row.capturedFor.desc()).all(),
    db.orm.public.GitHubTrafficPathSnapshot.orderBy((row) => row.capturedFor.desc()).all(),
  ]);

  const daily = dailyRows
    .filter((row) => String(row.day) >= String(cutoff))
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
    .map((row) => ({
      day: dayString(row.day),
      views: row.views,
      uniqueVisitors: row.uniqueVisitors,
      clones: row.clones,
      uniqueClones: row.uniqueClones,
    }));

  const capturedFor = referrerRows[0] ? String(referrerRows[0].capturedFor) : null;
  const latestReferrers = referrerRows.filter((row) => String(row.capturedFor) === capturedFor);
  const latestPaths = pathRows.filter((row) => String(row.capturedFor) === capturedFor);

  return {
    days,
    totals: {
      views: dailyRows.reduce((sum, row) => sum + row.views, 0),
      uniqueVisitors: dailyRows.reduce((sum, row) => sum + row.uniqueVisitors, 0),
      clones: dailyRows.reduce((sum, row) => sum + row.clones, 0),
      uniqueClones: dailyRows.reduce((sum, row) => sum + row.uniqueClones, 0),
    },
    daily,
    referrers: latestReferrers
      .map((row) => ({ label: row.referrer, count: row.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    paths: latestPaths
      .map((row) => ({ label: row.path, count: row.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    capturedFor,
  };
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export type ReleaseAnalytics = {
  assetCount: number;
  totalDownloads: number;
  channels: { stable: number; beta: number; alpha: number; rc: number; unknown: number };
  releaseGroups: {
    tag: string;
    channel: ReleaseChannel;
    channelLabel: string;
    totalDownloads: number;
    assetCount: number;
    publishedAt: string | null;
    prerelease: boolean;
  }[];
  assets: {
    id: string;
    tag: string;
    channel: string;
    channelLabel: string;
    fileName: string;
    platform: string;
    format: string;
    size: number;
    downloads: number;
    latestDelta: number | null;
    digest: string | null;
    publishedAt: string | null;
    prerelease: boolean;
    arch: string;
  }[];
  byPlatform: CountRow[];
  byFormat: CountRow[];
  byArch: CountRow[];
};

export async function getReleaseAnalytics(): Promise<ReleaseAnalytics> {
  const [assets, snapshots] = await Promise.all([
    db.orm.public.GitHubReleaseAsset.orderBy((row) => row.releaseTag.desc()).all(),
    db.orm.public.GitHubDownloadSnapshot.orderBy((row) => row.snapshotDate.asc()).all(),
  ]);

  const snapshotsByAsset = new Map<string, number[]>();
  for (const snapshot of snapshots) {
    const list = snapshotsByAsset.get(snapshot.assetId) ?? [];
    list.push(snapshot.downloadCount);
    snapshotsByAsset.set(snapshot.assetId, list);
  }

  const channels = { stable: 0, beta: 0, alpha: 0, rc: 0, unknown: 0 };
  for (const asset of assets) {
    const ch = asset.releaseChannel as ReleaseChannel;
    if (ch === 'stable') channels.stable += asset.currentDownloadCount;
    else if (ch === 'beta') channels.beta += asset.currentDownloadCount;
    else if (ch === 'alpha') channels.alpha += asset.currentDownloadCount;
    else if (ch === 'rc') channels.rc += asset.currentDownloadCount;
    else channels.unknown += asset.currentDownloadCount;
  }

  // Build per-release groups
  const releaseMap = new Map<string, {
    tag: string;
    channel: ReleaseChannel;
    totalDownloads: number;
    assetCount: number;
    publishedAt: string | null;
    prerelease: boolean;
  }>();
  for (const asset of assets) {
    const existing = releaseMap.get(asset.releaseTag);
    const pubAt = asset.releasePublishedAt ? String(asset.releasePublishedAt) : null;
    if (existing) {
      existing.totalDownloads += asset.currentDownloadCount;
      existing.assetCount++;
      if (!existing.publishedAt && pubAt) existing.publishedAt = pubAt;
    } else {
      releaseMap.set(asset.releaseTag, {
        tag: asset.releaseTag,
        channel: asset.releaseChannel as ReleaseChannel,
        totalDownloads: asset.currentDownloadCount,
        assetCount: 1,
        publishedAt: pubAt,
        prerelease: asset.isPrerelease,
      });
    }
  }

  const releaseGroups = Array.from(releaseMap.values()).map((r) => ({
    ...r,
    channelLabel: CHANNEL_LABELS[r.channel] ?? r.channel,
  }));

  // Platform / format / arch aggregates
  const platformMap = new Map<string, number>();
  const formatMap = new Map<string, number>();
  const archMap = new Map<string, number>();

  for (const asset of assets) {
    const p = asset.platform ?? 'unbekannt';
    platformMap.set(p, (platformMap.get(p) ?? 0) + asset.currentDownloadCount);
    const f = asset.format ?? 'unbekannt';
    formatMap.set(f, (formatMap.get(f) ?? 0) + asset.currentDownloadCount);
    // Arch is derived from filename
    const arch = detectArchFromFilename(asset.fileName) || 'unbekannt';
    archMap.set(arch, (archMap.get(arch) ?? 0) + asset.currentDownloadCount);
  }

  const toCountRows = (m: Map<string, number>): CountRow[] =>
    Array.from(m.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    assetCount: assets.length,
    totalDownloads: assets.reduce((sum, asset) => sum + asset.currentDownloadCount, 0),
    channels,
    releaseGroups,
    assets: assets.slice(0, 200).map((asset) => {
      const counts = snapshotsByAsset.get(asset.id) ?? [];
      const latest = counts.at(-1);
      const previous = counts.at(-2);
      return {
        id: asset.id,
        tag: asset.releaseTag,
        channel: asset.releaseChannel,
        channelLabel: CHANNEL_LABELS[asset.releaseChannel as ReleaseChannel] ?? asset.releaseChannel,
        fileName: asset.fileName,
        platform: asset.platform ?? '–',
        format: asset.format ?? '–',
        size: Number(asset.size),
        downloads: asset.currentDownloadCount,
        latestDelta: latest !== undefined && previous !== undefined ? Math.max(0, latest - previous) : null,
        digest: asset.digest,
        publishedAt: asset.releasePublishedAt ? String(asset.releasePublishedAt) : null,
        prerelease: asset.isPrerelease,
        arch: detectArchFromFilename(asset.fileName),
      };
    }),
    byPlatform: toCountRows(platformMap),
    byFormat: toCountRows(formatMap),
    byArch: toCountRows(archMap),
  };
}

/** Arch detection from asset filename (mirrors website.ts detectArch). */
function detectArchFromFilename(fileName: string | null | undefined): string {
  if (!fileName) return '';
  if (/arm64|aarch64/i.test(fileName)) return 'arm64';
  if (/armv7|armhf/i.test(fileName)) return 'arm';
  if (/x64|amd64|x86_64/i.test(fileName)) return 'x64';
  if (/ia32|i386|x86/i.test(fileName)) return 'x86';
  return '';
}

// ---------------------------------------------------------------------------
// Website download requests
// ---------------------------------------------------------------------------

export type DownloadRequestAnalytics = {
  days: AnalyticsWindow;
  totalRequests: number;
  daily: { day: string; count: number }[];
  byChannel: CountRow[];
  byPlatform: CountRow[];
  byArch: CountRow[];
  byCountry: CountRow[];
  byReferrer: CountRow[];
};

export async function getDownloadRequestAnalytics(
  days: AnalyticsWindow,
): Promise<DownloadRequestAnalytics> {
  const cutoff = windowCutoff(days);
  const rows = await db.orm.public.WebsiteDownloadRequestDaily.where((row) =>
    row.day.gte(cutoff),
  ).all();

  const daily = new Map<string, number>();
  for (const row of rows) {
    const day = dayString(row.day);
    daily.set(day, (daily.get(day) ?? 0) + row.count);
  }

  return {
    days,
    totalRequests: rows.reduce((sum, row) => sum + row.count, 0),
    daily: [...daily.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byChannel: topCounts(rows.map((row) => ({ key: row.channel || 'unbekannt', count: row.count }))),
    byPlatform: topCounts(rows.map((row) => ({ key: row.platform || 'unbekannt', count: row.count }))),
    byArch: topCounts(rows.map((row) => ({ key: row.arch || 'unbekannt', count: row.count }))),
    byCountry: topCounts(rows.map((row) => ({ key: row.countryCode, count: row.count })), 20),
    byReferrer: topCounts(
      rows.map((row) => ({ key: row.referrerHost || 'direkt', count: row.count })),
      10,
    ),
  };
}

// ---------------------------------------------------------------------------
// Repository statistics
// ---------------------------------------------------------------------------

export type RepositoryAnalytics = {
  metadata: {
    stars: number;
    forks: number;
    watchers: number;
    openIssues: number;
    language: string | null;
    license: string | null;
    topics: string[];
    capturedFor: string;
  } | null;
  commitWeeks: { weekStart: string; total: number; days: number[] }[];
  contributors: CountRow[];
  contributorCapture: string | null;
  codeFrequency: { weekStart: string; additions: number; deletions: number }[];
  participation: { weekStart: string; allCount: number; ownerCount: number }[];
  punchCard: { weekday: number; hour: number; count: number }[];
};

export async function getRepositoryAnalytics(): Promise<RepositoryAnalytics> {
  const [metadataRows, commitRows, contributorRows, codeRows, participationRows, punchRows] =
    await Promise.all([
      db.orm.public.GitHubRepoStatsSnapshot.orderBy((row) => row.capturedFor.desc()).limit(1).all(),
      db.orm.public.GitHubCommitActivityWeek.orderBy((row) => row.weekStart.asc()).all(),
      db.orm.public.GitHubContributorSnapshot.orderBy((row) => row.capturedFor.desc()).all(),
      db.orm.public.GitHubCodeFrequencyWeek.orderBy((row) => row.weekStart.asc()).all(),
      db.orm.public.GitHubParticipationWeek.orderBy((row) => row.weekStart.asc()).all(),
      db.orm.public.GitHubPunchCardSlot.orderBy((row) => row.count.desc()).limit(10).all(),
    ]);

  const latest = metadataRows[0];
  const contributorCapture = contributorRows[0] ? String(contributorRows[0].capturedFor) : null;
  const latestContributors = contributorRows.filter(
    (row) => String(row.capturedFor) === contributorCapture,
  );

  return {
    metadata: latest
      ? {
          stars: latest.stars,
          forks: latest.forks,
          watchers: latest.watchers,
          openIssues: latest.openIssues,
          language: latest.language,
          license: latest.license,
          topics: latest.topics ? (JSON.parse(latest.topics) as string[]) : [],
          capturedFor: String(latest.capturedFor),
        }
      : null,
    commitWeeks: commitRows.slice(-12).map((row) => ({
      weekStart: dayString(row.weekStart),
      total: row.total,
      days: JSON.parse(row.daysJson) as number[],
    })),
    contributors: latestContributors
      .map((row) => ({ label: row.login, count: row.contributions }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    contributorCapture,
    codeFrequency: codeRows.slice(-12).map((row) => ({
      weekStart: dayString(row.weekStart),
      additions: row.additions,
      deletions: row.deletions,
    })),
    participation: participationRows.slice(-12).map((row) => ({
      weekStart: dayString(row.weekStart),
      allCount: row.allCount,
      ownerCount: row.ownerCount,
    })),
    punchCard: punchRows.map((row) => ({
      weekday: row.weekday,
      hour: row.hour,
      count: row.count,
    })),
  };
}

// ---------------------------------------------------------------------------
// Website page views
// ---------------------------------------------------------------------------

export type WebsiteAnalytics = {
  days: AnalyticsWindow;
  totalViews: number;
  daily: { day: string; count: number }[];
  byPath: CountRow[];
  byReferrer: CountRow[];
  byCountry: CountRow[];
  byDevice: CountRow[];
  byOs: CountRow[];
};

export async function getWebsiteAnalytics(days: AnalyticsWindow): Promise<WebsiteAnalytics> {
  const cutoff = windowCutoff(days);
  const rows = await db.orm.public.WebsitePageViewDaily.where((row) => row.day.gte(cutoff)).all();

  const daily = new Map<string, number>();
  for (const row of rows) {
    const day = dayString(row.day);
    daily.set(day, (daily.get(day) ?? 0) + row.count);
  }

  return {
    days,
    totalViews: rows.reduce((sum, row) => sum + row.count, 0),
    daily: [...daily.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byPath: topCounts(rows.map((row) => ({ key: row.path, count: row.count })), 20),
    byReferrer: topCounts(
      rows.map((row) => ({ key: row.referrerHost || 'direkt', count: row.count })),
      10,
    ),
    byCountry: topCounts(rows.map((row) => ({ key: row.countryCode, count: row.count })), 20),
    byDevice: topCounts(rows.map((row) => ({ key: row.deviceType, count: row.count })), 5),
    byOs: topCounts(rows.map((row) => ({ key: row.os, count: row.count })), 6),
  };
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export type AudienceAnalytics = {
  days: AnalyticsWindow;
  pageViews: {
    byCountry: CountRow[];
    byOs: CountRow[];
    byDevice: CountRow[];
  };
  downloadRequests: {
    byCountry: CountRow[];
    byPlatform: CountRow[];
  };
};

export async function getAudienceAnalytics(days: AnalyticsWindow): Promise<AudienceAnalytics> {
  const cutoff = windowCutoff(days);
  const [pageViews, downloads] = await Promise.all([
    db.orm.public.WebsitePageViewDaily.where((row) => row.day.gte(cutoff)).all(),
    db.orm.public.WebsiteDownloadRequestDaily.where((row) => row.day.gte(cutoff)).all(),
  ]);

  return {
    days,
    pageViews: {
      byCountry: topCounts(
        pageViews.map((row) => ({ key: row.countryCode, count: row.count })),
        20,
      ),
      byOs: topCounts(pageViews.map((row) => ({ key: row.os, count: row.count })), 6),
      byDevice: topCounts(pageViews.map((row) => ({ key: row.deviceType, count: row.count })), 5),
    },
    downloadRequests: {
      byCountry: topCounts(
        downloads.map((row) => ({ key: row.countryCode, count: row.count })),
        20,
      ),
      byPlatform: topCounts(
        downloads.map((row) => ({ key: row.platform || 'unbekannt', count: row.count })),
        8,
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Overview and sync status
// ---------------------------------------------------------------------------

export type AnalyticsOverview = {
  github: {
    views7: number | null;
    clones7: number | null;
    stars: number | null;
    assets: number | null;
    totalDownloads: number | null;
  };
  website: { pageViews7: number | null; downloadRequests7: number | null };
  sync: { lastSuccessAt: string | null; failingSources: number | null } | null;
  unavailable: string[];
};

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const cutoff = windowCutoff(7);

  const [traffic, pageViews, downloads, assets, repo, statuses] = await Promise.allSettled([
    db.orm.public.GitHubTrafficDaily.where((row) => row.day.gte(cutoff)).all(),
    db.orm.public.WebsitePageViewDaily.where((row) => row.day.gte(cutoff)).all(),
    db.orm.public.WebsiteDownloadRequestDaily.where((row) => row.day.gte(cutoff)).all(),
    db.orm.public.GitHubReleaseAsset.all(),
    db.orm.public.GitHubRepoStatsSnapshot.orderBy((row) => row.capturedFor.desc()).limit(1).all(),
    db.orm.public.AnalyticsSourceStatus.all(),
  ]);

  const unavailable: string[] = [];
  const value = <T,>(result: PromiseSettledResult<T>, label: string): T | null => {
    if (result.status === 'fulfilled') return result.value;
    unavailable.push(label);
    return null;
  };

  const trafficRows = value(traffic, 'Traffic');
  const pageViewRows = value(pageViews, 'Website');
  const downloadRows = value(downloads, 'Downloads');
  const assetRows = value(assets, 'Releases');
  const repoRows = value(repo, 'Repository');
  const statusRows = value(statuses, 'Sync-Status');

  const lastSuccess = statusRows?.reduce<string | null>((latest, row) => {
    if (!row.lastSuccessAt) return latest;
    const candidate = String(row.lastSuccessAt);
    return !latest || candidate > latest ? candidate : latest;
  }, null) ?? null;

  return {
    github: {
      views7: trafficRows ? trafficRows.reduce((sum, row) => sum + row.views, 0) : null,
      clones7: trafficRows ? trafficRows.reduce((sum, row) => sum + row.clones, 0) : null,
      stars: repoRows?.[0]?.stars ?? null,
      assets: assetRows?.length ?? null,
      totalDownloads: assetRows
        ? assetRows.reduce((sum, asset) => sum + asset.currentDownloadCount, 0)
        : null,
    },
    website: {
      pageViews7: pageViewRows ? pageViewRows.reduce((sum, row) => sum + row.count, 0) : null,
      downloadRequests7: downloadRows ? downloadRows.reduce((sum, row) => sum + row.count, 0) : null,
    },
    sync: statusRows
      ? {
          lastSuccessAt: lastSuccess,
          failingSources: statusRows.filter(
            (row) => row.status === 'FAILED' || row.status === 'PARTIAL',
          ).length,
        }
      : null,
    unavailable,
  };
}

export type AnalyticsSyncData = {
  runs: {
    id: string;
    source: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    httpStatus: number | null;
    itemCount: number;
    errorCode: string | null;
  }[];
  sources: {
    source: string;
    status: string;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastHttpStatus: number | null;
    lastErrorCode: string | null;
  }[];
};

export async function getAnalyticsSyncData(): Promise<AnalyticsSyncData> {
  const [runs, sources] = await Promise.all([
    db.orm.public.AnalyticsSyncRun.orderBy((row) => row.startedAt.desc()).limit(25).all(),
    db.orm.public.AnalyticsSourceStatus.all(),
  ]);

  return {
    runs: runs.map((run) => ({
      id: run.id,
      source: run.source,
      status: run.status,
      startedAt: String(run.startedAt),
      completedAt: run.completedAt ? String(run.completedAt) : null,
      httpStatus: run.httpStatus,
      itemCount: run.itemCount,
      errorCode: run.errorCode,
    })),
    sources: sources
      .map((source) => ({
        source: source.source,
        status: source.status,
        lastSuccessAt: source.lastSuccessAt ? String(source.lastSuccessAt) : null,
        lastFailureAt: source.lastFailureAt ? String(source.lastFailureAt) : null,
        lastHttpStatus: source.lastHttpStatus,
        lastErrorCode: source.lastErrorCode,
      }))
      .sort((a, b) => a.source.localeCompare(b.source)),
  };
}
