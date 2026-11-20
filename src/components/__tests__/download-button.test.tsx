import { render, screen } from '@testing-library/react';
import DownloadButton, { type DownloadOption } from '../public/DownloadButton';

const assets: DownloadOption[] = [
  {
    name: 'WebRadio-1.0.6-win-x64.exe',
    platform: 'windows',
    platformLabel: 'Windows (x64)',
    downloadUrl:
      'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/WebRadio-1.0.6-win-x64.exe',
    size: 136_641_014,
  },
  {
    name: 'WebRadio-1.0.6-linux-x86_64.AppImage',
    platform: 'linux',
    platformLabel: 'Linux (x86_64)',
    downloadUrl:
      'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/WebRadio-1.0.6-linux-x86_64.AppImage',
    size: 120_000_000,
  },
];

describe('DownloadButton', () => {
  // jsdom derives navigator.userAgent from the host OS, so the component's
  // system detection would answer "linux" on CI and "windows" on a Windows
  // workstation. Pin the user agent so the expectation holds everywhere.
  beforeAll(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
  });

  it('renders a working link without JavaScript and offers other platforms', () => {
    render(<DownloadButton assets={assets} version="1.0.6" otherPlatformsHref="#stable-heading" />);

    const primary = screen.getByRole('link', { name: /herunterladen/i });
    expect(primary).toHaveAttribute('href', assets[0]?.downloadUrl);
    expect(primary.textContent).toMatch(/Windows \(x64\)/);
    expect(primary.textContent).toMatch(/v1\.0\.6/);
    expect(screen.getByRole('link', { name: /Andere Plattformen/i })).toHaveAttribute(
      'href',
      '#stable-heading',
    );
  });

  it('falls back to the download list when a release has no files', () => {
    render(<DownloadButton assets={[]} version="1.0.6" otherPlatformsHref="#stable-heading" />);

    expect(screen.getByRole('link', { name: /Downloads ansehen/i })).toHaveAttribute(
      'href',
      '#stable-heading',
    );
  });
});
