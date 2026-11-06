import {
  MIN_PLAUSIBLE_PACKAGE_BYTES,
  PACKAGE_UNDER_REVIEW_LABEL,
  assessDownloadPackage,
  assessDownloadUrl,
  isPlausibleDownloadPackage,
} from '../release-asset-quality';

describe('release asset quality', () => {
  it('flags an implausibly small desktop package', () => {
    expect(assessDownloadPackage('webradio-1.0.6-1-x86_64.pkg.tar.zst', 66 * 1024)).toBe(
      'too-small',
    );
    expect(isPlausibleDownloadPackage('webradio-1.0.6-1-x86_64.pkg.tar.zst', 66 * 1024)).toBe(false);
  });

  it('accepts a desktop package at the threshold or above', () => {
    expect(assessDownloadPackage('WebRadio-1.0.6-win-x64.exe', MIN_PLAUSIBLE_PACKAGE_BYTES)).toBe(
      'ok',
    );
    expect(assessDownloadPackage('WebRadio-1.0.6-win-x64.exe', 136641014)).toBe('ok');
  });

  it('does not apply the desktop threshold to plugin and theme archives', () => {
    expect(assessDownloadPackage('snip3r-carbon.zip', 45 * 1024)).toBe('ok');
    expect(assessDownloadPackage('minimal-theme.tar.gz', 12 * 1024)).toBe('ok');
  });

  it('reports an unknown size instead of treating it as valid', () => {
    expect(assessDownloadPackage('WebRadio-1.0.6.AppImage', 0)).toBe('unknown-size');
    expect(assessDownloadPackage('WebRadio-1.0.6.AppImage', null)).toBe('unknown-size');
  });

  it('derives the file name from a download URL', () => {
    expect(
      assessDownloadUrl(
        'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/webradio-1.0.6-1-x86_64.pkg.tar.zst',
        66 * 1024,
      ),
    ).toBe('too-small');
    expect(
      assessDownloadUrl('https://example.com/files/theme.zip?token=abc', 30 * 1024),
    ).toBe('ok');
    expect(assessDownloadUrl(null, 0)).toBe('ok');
  });

  it('exposes a plain-language label for the note', () => {
    expect(PACKAGE_UNDER_REVIEW_LABEL).toBe('Paket wird geprüft');
  });
});
