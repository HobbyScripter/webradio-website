import { GitHubError, getGitHubSnapshot } from '@/lib/github';
import { publicJson } from '@/lib/public-api';

/**
 * GET /api/releases
 *
 * GitHub is the authoritative source for official releases. The route never
 * reads the website database Release table and never returns a download URL
 * that did not come from a validated GitHub asset of this repository.
 *
 * Responses are `no-store`: a withdrawn or replaced release must not survive in
 * a shared CDN cache. The server-side GitHub client keeps a bounded five-minute
 * cache and reports `source.stale` when it had to use older public data.
 */
export async function GET() {
  try {
    const snapshot = await getGitHubSnapshot();

    return publicJson({
      data: snapshot.releases.map((release) => ({
        id: release.id,
        tagName: release.tagName,
        name: release.name,
        htmlUrl: release.htmlUrl,
        publishedAt: release.publishedAt,
        channel: release.channel,
        notes: release.notes,
        assets: release.assets,
      })),
      latest: {
        stable: snapshot.latestStable?.tagName ?? null,
        beta: snapshot.latestBeta?.tagName ?? null,
        alpha: snapshot.latestAlpha?.tagName ?? null,
      },
      repository: {
        fullName: snapshot.repository.fullName,
        htmlUrl: snapshot.repository.htmlUrl,
        license: snapshot.repository.license,
      },
      source: {
        provider: 'github',
        fetchedAt: snapshot.fetchedAt,
        stale: snapshot.stale,
      },
    });
  } catch (error) {
    const code = error instanceof GitHubError ? error.code : 'GITHUB_UNAVAILABLE';
    // Log only a stable code. Never log response bodies, headers, tokens or
    // anything that could identify a private account.
    console.error('[api.releases] GitHub data unavailable', { code });

    return publicJson(
      {
        error: 'RELEASES_UNAVAILABLE',
        message:
          'Die offiziellen Release-Daten sind derzeit nicht verfügbar. Es werden keine Ersatzdaten angezeigt.',
        source: { provider: 'github' },
      },
      { status: 503, cache: false },
    );
  }
}
