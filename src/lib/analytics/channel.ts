/**
 * Central release-channel classification.
 *
 * Rules (case-insensitive, SemVer-aware):
 *   – Stable:           no prerelease segment, e.g. "1.0.8", "v1.0.8"
 *   – Alpha:            tag contains "alpha"
 *   – Beta:             tag contains "beta"
 *   – RC (Release Candidate): tag contains "rc" (but not "alpha" or "beta")
 *   – Unknown:          prerelease tag that cannot be classified
 *
 * Important: the GitHub `prerelease` flag alone is insufficient – GitHub marks
 * *any* pre-release as `prerelease: true`, including RCs. We always inspect the
 * tag name for the channel sub-type.
 *
 * Historical snapshots must never be re-classified; this function only runs
 * when a new asset row is first created (see download-analytics-service.ts).
 */

export type ReleaseChannel = 'stable' | 'alpha' | 'beta' | 'rc' | 'unknown';

/**
 * Map of channel values to display-friendly German labels.
 */
export const CHANNEL_LABELS: Record<ReleaseChannel, string> = {
  stable: 'Stable',
  beta: 'Beta',
  rc: 'Release Candidate',
  alpha: 'Alpha',
  unknown: 'Unbekannt',
};

/**
 * Colour tokens for each channel (Tailwind-compatible CSS custom-property values).
 * Colours are used for accents; labels are always shown as text too.
 */
export const CHANNEL_COLORS: Record<ReleaseChannel, string> = {
  stable: '#22c55e',
  beta: '#f59e0b',
  rc: '#8b5cf6',
  alpha: '#ef4444',
  unknown: '#71717a',
};

/**
 * Returns the release channel for a tag name and the GitHub `prerelease` flag.
 *
 * @param tagName    The git tag, e.g. "v1.0.8-rc.1" or "1.0.8".
 * @param prerelease The `prerelease` boolean from the GitHub Releases API.
 *                   If false, the release is always Stable.
 * @returns          One of the five ReleaseChannel values.
 */
export function channelFor(tagName: string, prerelease: boolean): ReleaseChannel {
  if (!prerelease) return 'stable';

  // Sanitise: strip leading "v", normalise to lower-case for matching.
  const tag = tagName.trim().toLowerCase();

  if (tag.includes('alpha')) return 'alpha';
  if (tag.includes('beta')) return 'beta';
  // "rc" must be tested after alpha/beta so "alphabeta" is not incorrectly
  // matched (purely theoretical but correct semantics).
  if (/(?:^|[.\-_])rc(?:[.\-_\d]|$)/.test(tag)) return 'rc';

  // The prerelease flag is set but the tag does not match any known prefix.
  return 'unknown';
}

/**
 * Returns true when the channel is any form of pre-release (not Stable).
 */
export function isPreReleaseChannel(channel: ReleaseChannel): boolean {
  return channel !== 'stable';
}
