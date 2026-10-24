/**
 * Display formatting helpers (server-safe, no dependencies).
 */

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Format an ISO timestamp as a German date; returns null for invalid input. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return dateFormatter.format(date);
}

/** 1536 -> "1,5 KB"; null/undefined -> null. */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const formatted = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);

  return `${formatted} ${units[unit]}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE').format(value);
}

export type ReleaseChannel = 'stable' | 'beta';

/**
 * Derive the release channel from SemVer prerelease syntax. There is no
 * separate channel column in the contract, so nothing else is inferred.
 */
export function releaseChannel(version: string): ReleaseChannel {
  return version.includes('-') ? 'beta' : 'stable';
}

export function releaseChannelLabel(version: string): string {
  return releaseChannel(version) === 'beta' ? 'Beta' : 'Stabil';
}
