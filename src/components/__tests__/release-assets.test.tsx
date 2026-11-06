import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReleaseAssets from '../public/ReleaseAssets';
import ReleaseNotes, { truncateAtParagraph } from '../public/ReleaseNotes';
import DownloadButton from '../public/DownloadButton';
import type { GitHubAsset } from '@/lib/github';

const expectedDigest = 'sha256:' + 'a'.repeat(64);

const asset: GitHubAsset = {
  name: 'WebRadio-1.0.6-win-x64.exe',
  size: 136641014,
  digest: expectedDigest,
  downloadUrl:
    'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/WebRadio-1.0.6-win-x64.exe',
  platform: 'windows',
  platformLabel: 'Windows (x64)',
  format: 'Installer (EXE)',
};

const releaseUrl = 'https://github.com/YourEliteSystems/WebRadio/releases/tag/v1.0.6';

describe('ReleaseAssets', () => {
  it('does not render a download button when no artifact exists', () => {
    render(<ReleaseAssets assets={[]} releaseUrl={releaseUrl} />);

    expect(
      screen.getByText(/keine Installationsdateien hinterlegt/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /herunterladen/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /release auf github öffnen/i })).toHaveAttribute(
      'href',
      releaseUrl,
    );
  });

  it('renders the exact validated GitHub URL, size and digest', () => {
    render(<ReleaseAssets assets={[asset]} releaseUrl={releaseUrl} />);

    const link = screen.getByRole('link', {
      name: /Windows \(x64\): WebRadio-1\.0\.6-win-x64\.exe herunterladen/i,
    });
    expect(link).toHaveAttribute('href', asset.downloadUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(asset.name)).toBeInTheDocument();
    expect(screen.getByText('130,3 MB')).toBeInTheDocument();
    expect(screen.getByText(expectedDigest)).toBeInTheDocument();
  });

  it('does not offer an implausibly small package as a download', () => {
    const archAsset: GitHubAsset = {
      name: 'webradio-1.0.6-1-x86_64.pkg.tar.zst',
      size: 66 * 1024,
      digest: null,
      downloadUrl:
        'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/webradio-1.0.6-1-x86_64.pkg.tar.zst',
      platform: 'arch',
      platformLabel: 'Arch Linux (x86_64)',
      format: 'Arch-Paket (.pkg.tar.zst)',
    };

    render(<ReleaseAssets assets={[archAsset]} releaseUrl={releaseUrl} />);

    expect(screen.getByText('Paket wird geprüft')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Arch Linux \(x86_64\).*herunterladen/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(archAsset.name)).toBeInTheDocument();
  });
});

describe('ReleaseNotes', () => {
  it('renders release notes as text and never injects HTML from GitHub', () => {
    const { container } = render(
      <ReleaseNotes
        notes={'## Änderungen\n\n- Stabiler Build\n\n<script>alert(1)</script>'}
      />,
    );

    expect(screen.getByText('Änderungen')).toBeInTheDocument();
    expect(screen.getByText('Stabiler Build')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('alert(1)')).toBeInTheDocument();
  });

  it('drops repeated boilerplate header rows', () => {
    render(
      <ReleaseNotes notes={'Release Stage: stable\nVersion: 1.2.3\nRelease Date: 1. Oktober\n\n- Neu'} />,
    );

    expect(screen.queryByText(/Release Stage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Release Date/)).not.toBeInTheDocument();
    expect(screen.getByText('Neu')).toBeInTheDocument();
  });

  it('collapses fenced technical details', () => {
    render(<ReleaseNotes notes={'Kurz\n\n```\nnpm run build\n```'} />);

    expect(screen.getByText('Codeausschnitt')).toBeInTheDocument();
    expect(screen.getByText('npm run build')).toBeInTheDocument();
  });

  it('shows the summary first and keeps the technical part collapsed', () => {
    render(
      <ReleaseNotes
        notes={
          '## Was ist neu\n\n- Schnellere Sendersuche\n\n## Technische Details\n\n- Neues Protokoll'
        }
      />,
    );

    expect(screen.getByText('Was ist neu?')).toBeInTheDocument();
    expect(screen.getByText('Schnellere Sendersuche')).toBeInTheDocument();

    const summary = screen.getByText('Technische Details', { selector: 'summary' });
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Neues Protokoll')).toBeInTheDocument();
  });
});

describe('DownloadButton server rendering', () => {
  it('renders the system download and the other-platforms link without JavaScript', () => {
    const html = renderToStaticMarkup(
      <DownloadButton
        version="1.0.6"
        otherPlatformsHref="#stable-heading"
        assets={[
          {
            name: asset.name,
            platform: 'windows',
            platformLabel: 'Windows (x64)',
            downloadUrl: asset.downloadUrl,
            size: asset.size,
          },
        ]}
      />,
    );

    expect(html).toContain('Für Windows (x64) herunterladen (v1.0.6, stabil)');
    expect(html).toContain('Andere Plattformen');
    expect(html).toContain('href="#stable-heading"');
    expect(html).toContain(asset.downloadUrl);
  });
});

describe('truncateAtParagraph', () => {
  it('does not cut inside a word', () => {
    const text = 'Erster Absatz mit Inhalt.\n\nZweiter Absatz mit deutlich mehr Text als erlaubt.';
    const cut = truncateAtParagraph(text, 40);

    expect(cut.endsWith('Inhalt.')).toBe(true);
    expect(text.startsWith(cut)).toBe(true);
  });

  it('returns short text unchanged', () => {
    expect(truncateAtParagraph('Kurz.', 100)).toBe('Kurz.');
  });
});
