jest.mock('next/cache', () => ({
  io: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/github', () => ({
  getGitHubSnapshot: jest.fn(),
}));

import { renderToStaticMarkup } from 'react-dom/server';
import { ReleasesContent } from '../releases/page';
import { getGitHubSnapshot, type GitHubSnapshot } from '@/lib/github';

const mockSnapshot = jest.mocked(getGitHubSnapshot);

const stableAsset = {
  name: 'WebRadio-1.0.6-win-x64.exe',
  size: 136641014,
  digest: 'sha256:' + 'a'.repeat(64),
  downloadUrl:
    'https://github.com/YourEliteSystems/WebRadio/releases/download/v1.0.6/WebRadio-1.0.6-win-x64.exe',
  platform: 'windows' as const,
  platformLabel: 'Windows (x64)',
  format: 'Installer (EXE)',
};

const release = (tagName: string, channel: 'stable' | 'beta') => ({
  id: channel === 'stable' ? 1 : 2,
  tagName,
  name: `WebRadio ${tagName.replace(/^v/, '')}`,
  htmlUrl: `https://github.com/YourEliteSystems/WebRadio/releases/tag/${tagName}`,
  publishedAt:
    channel === 'stable' ? '2026-09-18T18:49:43Z' : '2026-10-17T18:08:22Z',
  channel,
  isPrerelease: channel === 'beta',
  notes: '## Änderungen\n\n- Stabiler Build',
  assets: [stableAsset],
});

const snapshot: GitHubSnapshot = {
  repository: {
    fullName: 'YourEliteSystems/WebRadio',
    htmlUrl: 'https://github.com/YourEliteSystems/WebRadio',
    description: 'Desktop radio player',
    defaultBranch: 'main',
    license: {
      name: 'Apache License 2.0',
      spdxId: 'Apache-2.0',
      url: 'https://api.github.com/licenses/apache-2.0',
    },
    homepage: null,
    topics: ['internet-radio'],
    archived: false,
    pushedAt: '2026-10-17T18:00:00Z',
  },
  releases: [release('v1.0.7-beta.2', 'beta'), release('v1.0.6', 'stable')],
  latestStable: null,
  latestBeta: null,
  latestAlpha: null,
  fetchedAt: '2026-10-24T19:00:00.000Z',
  stale: false,
};
snapshot.latestStable = snapshot.releases[1]!;
snapshot.latestBeta = snapshot.releases[0]!;

beforeEach(() => {
  mockSnapshot.mockReset();
});

describe('release page content', () => {
  it('renders stable and beta versions with exact GitHub download URLs', async () => {
    mockSnapshot.mockResolvedValue(snapshot);

    const html = renderToStaticMarkup(await ReleasesContent());

    expect(html).toContain('Neueste stabile Version');
    expect(html).toContain('v1.0.6');
    expect(html).toContain('v1.0.7-beta.2');
    expect(html).toContain(stableAsset.downloadUrl);
    expect(html).toContain('Windows (x64)');
    expect(html).toContain('Stabil');
    expect(html).toContain('Beta');
  });

  it('shows a usable error state without invented versions when GitHub fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSnapshot.mockRejectedValue(new Error('GitHub is down'));

    const html = renderToStaticMarkup(await ReleasesContent());

    expect(html).toContain('GitHub-Daten konnten nicht geladen werden');
    expect(html).toContain('Erneut versuchen');
    expect(html).not.toContain('v1.0.6');
    expect(html).not.toContain('/releases/download/');
    expect(html).not.toContain('undefined');
  });

  it('shows an empty state, not fabricated releases, when GitHub returns none', async () => {
    mockSnapshot.mockResolvedValue({
      ...snapshot,
      releases: [],
      latestStable: null,
      latestBeta: null,
      latestAlpha: null,
    });

    const html = renderToStaticMarkup(await ReleasesContent());

    expect(html).toContain('Keine öffentlichen Releases gefunden');
    expect(html).not.toContain('/releases/download/');
  });
});
