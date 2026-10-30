/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';

// `connection()` marks the route as request-time; outside the Next server it
// has no request store, so tests stub it.
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, connection: jest.fn().mockResolvedValue(undefined) };
});

jest.mock('@/lib/server-auth', () => ({
  requireDeveloperSession: jest.fn(),
}));

jest.mock('@/lib/rate-limit-http', () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/github-releases', () => {
  const actual = jest.requireActual('@/lib/github-releases');
  return { ...actual, listRepositoryReleases: jest.fn() };
});

import { GET } from '@/app/api/developer/github/releases/route';
import { requireDeveloperSession } from '@/lib/server-auth';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import { listRepositoryReleases } from '@/lib/github-releases';
import { UnauthorizedError } from '@/lib/auth-service';

const mockSession = jest.mocked(requireDeveloperSession);
const mockLimit = jest.mocked(enforceRateLimits);
const mockList = jest.mocked(listRepositoryReleases);

const user = {
  id: 'user-1',
  email: 'dev@example.test',
  name: 'Dev',
  role: 'DEVELOPER' as const,
  sessionId: 'session-1',
  emailVerified: null,
};

const list = {
  repository: { fullName: 'owner/repo', url: 'https://github.com/owner/repo' },
  releases: [
    {
      id: 1,
      tagName: 'v1.0.0',
      version: '1.0.0',
      name: 'Erste Version',
      publishedAt: '2026-10-01T10:00:00.000Z',
      htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
      isPrerelease: false,
      notes: 'Notizen',
      assets: [],
    },
  ],
  fetchedAt: '2026-10-30T10:00:00.000Z',
  stale: false,
};

function request(url: string) {
  return new NextRequest(`http://localhost/api/developer/github/releases?url=${encodeURIComponent(url)}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue(user);
  mockLimit.mockResolvedValue(null);
  mockList.mockResolvedValue(list);
});

describe('GET /api/developer/github/releases', () => {
  it('requires a developer session', async () => {
    mockSession.mockRejectedValue(new UnauthorizedError('Bitte melde dich an.'));

    const response = await GET(request('https://github.com/owner/repo'));

    expect(response.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('rejects a non-GitHub URL without contacting GitHub', async () => {
    const response = await GET(request('https://example.com/owner/repo'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('GITHUB_HOST_INVALID');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('applies the per-account lookup limit', async () => {
    mockLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }),
    );

    const response = await GET(request('https://github.com/owner/repo'));

    expect(response.status).toBe(429);
    expect(mockLimit).toHaveBeenCalledWith([
      { scope: 'githubLookup', identifier: 'user-1' },
    ]);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns the validated release list with no-store headers', async () => {
    const response = await GET(request('https://github.com/owner/repo/tree/main'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(list);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'owner', repo: 'repo' }),
    );
  });

  it('maps a missing repository to 404', async () => {
    const { GitHubReleaseError } = jest.requireActual('@/lib/github-releases');
    mockList.mockRejectedValueOnce(new GitHubReleaseError('GITHUB_NOT_FOUND', { status: 404 }));

    const response = await GET(request('https://github.com/owner/repo'));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.message).toMatch(/Repository nicht gefunden/);
  });

  it('maps rate limiting to 429 with Retry-After', async () => {
    const { GitHubReleaseError } = jest.requireActual('@/lib/github-releases');
    mockList.mockRejectedValueOnce(
      new GitHubReleaseError('GITHUB_RATE_LIMITED', { status: 403, retryAfterSeconds: 90 }),
    );

    const response = await GET(request('https://github.com/owner/repo'));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('90');
  });

  it('maps a GitHub outage to 502', async () => {
    const { GitHubReleaseError } = jest.requireActual('@/lib/github-releases');
    mockList.mockRejectedValueOnce(new GitHubReleaseError('GITHUB_UNAVAILABLE'));

    const response = await GET(request('https://github.com/owner/repo'));

    expect(response.status).toBe(502);
  });
});
