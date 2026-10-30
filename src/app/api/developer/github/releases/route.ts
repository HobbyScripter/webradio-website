import { NextResponse, connection } from 'next/server';
import { requireDeveloperSession } from '@/lib/server-auth';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import { GitHubRepositoryError, parseGitHubRepositoryInput } from '@/lib/github-repository';
import { GitHubReleaseError, listRepositoryReleases } from '@/lib/github-releases';

/**
 * GET /api/developer/github/releases?url=https://github.com/OWNER/REPOSITORY
 *
 * Read-only helper for the version form. It only ever contacts
 * `api.github.com/repos/<owner>/<repo>/releases`; the browser can not choose a
 * host, path or API version. Nothing is published and no database row changes.
 *
 * A successful answer with `releases: []` is not an error: the UI tells the
 * developer that the repository has no releases and keeps the manual fields
 * available.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Session- and rate-limit-dependent, so this is a request-time route and must
  // never be evaluated during the build.
  await connection();

  let user;
  try {
    user = await requireDeveloperSession();
  } catch (error) {
    return errorResponse('api:developer:github:releases:auth', error);
  }

  const limited = await enforceRateLimits([{ scope: 'githubLookup', identifier: user.id }]);
  if (limited) {
    return limited;
  }

  const rawUrl = new URL(request.url).searchParams.get('url') ?? '';

  let ref;
  try {
    ref = parseGitHubRepositoryInput(rawUrl);
  } catch (error) {
    if (error instanceof GitHubRepositoryError) {
      return noStoreJson({ error: error.code, message: error.message }, 400);
    }
    return errorResponse('api:developer:github:releases:input', error);
  }

  try {
    const list = await listRepositoryReleases(ref);
    return noStoreJson({
      repository: list.repository,
      releases: list.releases,
      fetchedAt: list.fetchedAt,
      stale: list.stale,
    });
  } catch (error) {
    if (error instanceof GitHubReleaseError) {
      const status =
        error.code === 'GITHUB_NOT_FOUND'
          ? 404
          : error.code === 'GITHUB_RATE_LIMITED'
            ? 429
            : 502;

      return NextResponse.json(
        { error: error.code, message: error.message },
        {
          status,
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...(error.retryAfterSeconds
              ? { 'Retry-After': String(error.retryAfterSeconds) }
              : {}),
          },
        },
      );
    }

    return errorResponse('api:developer:github:releases:GET', error);
  }
}
