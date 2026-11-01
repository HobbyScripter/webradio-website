import { io } from 'next/cache';
import { GitHubError, getGitHubSnapshot } from '@/lib/github';
import { RELEASES_CACHE_CONTROL, publicJson } from '@/lib/public-api';

/**
 * GET /api/releases
 *
 * GitHub is the authoritative source for official releases. The route never
 * reads the website database Release table and never returns a download URL
 * that did not come from a validated GitHub asset of this repository.
 *
 * Responses are cacheable for a short time (`s-maxage=300` with
 * `stale-while-revalidate`), because release data is public and changes rarely.
 * Catalogue endpoints keep `no-store`: a withdrawn entry must disappear at
 * once. The payload reports `source.fetchedAt` and `source.stale`.
 */
export async function GET() {
  // Keep the route out of the build-time prerender attempt: GitHub is a
  // runtime data source, and a build machine must not need network access.
  await io();

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
    }, { cacheControl: RELEASES_CACHE_CONTROL });
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
