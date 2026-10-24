import { render, screen } from '@testing-library/react';
import ReleaseAssets from '../public/ReleaseAssets';
import ReleaseNotes from '../public/ReleaseNotes';
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
});
