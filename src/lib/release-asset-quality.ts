/**
 * Plausibility check for downloadable packages.
 *
 * A desktop build below one megabyte is not a usable installer: it is either a
 * truncated upload, a placeholder or the wrong file that happens to carry an
 * installer extension. Such a file is still listed with its size, but it is not
 * offered as a download button until it has been checked.
 *
 * Plugin and theme packages are archives (usually `.zip`) and may legitimately
 * be small, so the rule only applies to desktop package formats.
 */

export const MIN_PLAUSIBLE_PACKAGE_BYTES = 1024 * 1024;

export const PACKAGE_UNDER_REVIEW_LABEL = 'Paket wird geprüft';

export type PackagePlausibility = 'ok' | 'too-small' | 'unknown-size';

const DESKTOP_PACKAGE_PATTERN = /\.(exe|msi|appimage|deb|rpm|pkg\.tar\.zst|dmg)$/i;

/** Check a file name and its reported size. */
export function assessDownloadPackage(
  name: string | null | undefined,
  size: number | null | undefined,
): PackagePlausibility {
  if (!name || !DESKTOP_PACKAGE_PATTERN.test(name.trim())) {
    return 'ok';
  }

  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return 'unknown-size';
  }

  return size < MIN_PLAUSIBLE_PACKAGE_BYTES ? 'too-small' : 'ok';
}

/** Check a stored download URL; the last path segment is the file name. */
export function assessDownloadUrl(
  url: string | null | undefined,
  size: number | null | undefined,
): PackagePlausibility {
  if (!url) {
    return 'ok';
  }

  try {
    const pathname = new URL(url).pathname;
    const name = pathname.slice(pathname.lastIndexOf('/') + 1);
    return assessDownloadPackage(decodeURIComponent(name), size);
  } catch {
    return 'ok';
  }
}

export function isPlausibleDownloadPackage(
  name: string | null | undefined,
  size: number | null | undefined,
): boolean {
  return assessDownloadPackage(name, size) === 'ok';
}
