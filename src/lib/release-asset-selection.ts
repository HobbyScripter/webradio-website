/**
 * Which GitHub release asset represents the package.
 *
 * A release often carries more than the installable archive: updater metadata
 * (`latest.yml`), block maps, checksum lists and small JSON manifests. Those are
 * *not* the package, so their size and digest must never be copied into a
 * catalogue version — a 575 B manifest would otherwise appear as the download
 * with a valid-looking checksum.
 *
 * The rules are purely name-based and dependency-free, so the server and the
 * developer form make the same decision.
 */

/** Update/verification metadata, never an installable package. */
const METADATA_PATTERNS: RegExp[] = [
  /\.ya?ml$/i,
  /\.json$/i,
  /\.blockmap$/i,
  /\.txt$/i,
  /\.md$/i,
  /\.sig$/i,
  /\.asc$/i,
  /\.sha256(?:sum)?$/i,
  /\.checksums?$/i,
];

/** Archives a plugin or theme is normally distributed as. */
const PACKAGE_PATTERNS: RegExp[] = [
  /\.zip$/i,
  /\.7z$/i,
  /\.rar$/i,
  /\.tar$/i,
  /\.tar\.gz$/i,
  /\.tgz$/i,
  /\.tar\.xz$/i,
  /\.tar\.zst$/i,
  /\.jar$/i,
  /\.wasm$/i,
];

export function isReleaseMetadataAsset(name: string): boolean {
  return METADATA_PATTERNS.some((pattern) => pattern.test(name.trim()));
}

export function isPackageAsset(name: string): boolean {
  const trimmed = name.trim();
  if (isReleaseMetadataAsset(trimmed)) {
    return false;
  }
  return PACKAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Order assets so a package is first and metadata comes last, keeping the
 * relative order of equally ranked entries.
 */
export function rankReleaseAssets<T extends { name: string }>(assets: readonly T[]): T[] {
  const rank = (name: string) =>
    isPackageAsset(name) ? 0 : isReleaseMetadataAsset(name) ? 2 : 1;
  return [...assets].sort((a, b) => rank(a.name) - rank(b.name));
}

/**
 * The asset that may be pre-filled as download. Returns `null` when the release
 * only contains metadata — the form then asks for the package instead of
 * quietly submitting a manifest.
 */
export function selectPrimaryReleaseAsset<T extends { name: string }>(
  assets: readonly T[],
): T | null {
  const packageAsset = assets.find((asset) => isPackageAsset(asset.name));
  if (packageAsset) {
    return packageAsset;
  }
  return assets.find((asset) => !isReleaseMetadataAsset(asset.name)) ?? null;
}
