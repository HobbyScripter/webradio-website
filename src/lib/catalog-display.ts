/**
 * Presentation helpers for catalogue entries. Pure functions so they can be
 * unit-tested without a database.
 */

/** Compare `1.2.3` style versions numerically; returns null for other shapes. */
function parseVersion(value: string | null | undefined): [number, number, number] | null {
  if (!value) {
    return null;
  }
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    return null;
  }
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return (left[index] ?? 0) - (right[index] ?? 0);
    }
  }
  return 0;
}

/**
 * Compatibility range in plain German:
 *   both bounds   -> "1.0.0 bis 2.0.0"
 *   lower bound   -> "ab 1.0.0"
 *   upper bound   -> "bis 2.0.0"
 *   none          -> null
 *
 * A missing upper bound never renders as "1.0.0 bis –".
 */
export function formatCompatibility(
  minVersion: string | null | undefined,
  maxVersion: string | null | undefined,
): string | null {
  const min = minVersion?.trim() || null;
  const max = maxVersion?.trim() || null;

  if (min && max) {
    return `${min} bis ${max}`;
  }
  if (min) {
    return `ab ${min}`;
  }
  if (max) {
    return `bis ${max}`;
  }
  return null;
}

/**
 * True when the entry needs a newer WebRadio than the latest stable release, so
 * the page can say "derzeit nur als Beta".
 */
export function requiresNewerStable(
  minVersion: string | null | undefined,
  latestStableTag: string | null | undefined,
): boolean {
  if (!minVersion || !latestStableTag) {
    return false;
  }
  const comparison = compareVersions(minVersion, latestStableTag);
  return comparison !== null && comparison > 0;
}

/** Versions below 1.0 are early releases; the card and detail page say so. */
export function isPreviewVersion(version: string | null | undefined): boolean {
  const parsed = parseVersion(version);
  return parsed !== null && parsed[0] === 0;
}

/**
 * Label for a developer's GitHub link. The stored field may be a profile or a
 * repository, so the label follows the URL instead of claiming "Profil" for a
 * repository (or the other way round).
 */
export function githubLinkLabel(rawUrl: string | null | undefined): string {
  if (!rawUrl) {
    return 'GitHub';
  }

  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return 'GitHub-Repository';
    }
    const account = segments[0];
    return account ? `GitHub-Profil von ${account}` : 'GitHub';
  } catch {
    return 'GitHub';
  }
}

/** Sort control is only useful once there is something to sort. */
export function shouldShowSortControls(visibleEntries: number, hasNextPage: boolean): boolean {
  return visibleEntries > 5 || hasNextPage;
}
