/**
 * Server-side GitHub integration for the official WebRadio project.
 *
 * GitHub is the authoritative source for the desktop application, its public
 * releases and the release assets. This module deliberately has no database
 * dependency: a GitHub outage must never affect authentication, moderation or
 * any other website-owned data.
 *
 * Only `YourEliteSystems/WebRadio` can be read. The repository identity in every
 * response is validated against this constant, so a compromised or misrouted
 * API answer cannot turn the website into a catalogue for another product.
 *
 * Caching: successful answers are kept for five minutes per server instance and
 * used as a stale fallback (at most 24 hours old) when GitHub is unreachable or
 * rate limited. Vercel may run several instances, so this is not a shared CDN
 * cache; public API responses are `no-store` and every payload reports its
 * `fetchedAt` and `stale` state.
 */
import { z } from 'zod';

export const GITHUB_REPOSITORY = 'YourEliteSystems/WebRadio' as const;
export const GITHUB_REPOSITORY_URL =
  'https://github.com/YourEliteSystems/WebRadio' as const;
export const GITHUB_RELEASES_URL = `${GITHUB_REPOSITORY_URL}/releases` as const;
export const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest` as const;

const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_STALE_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_RELEASES = 40;
const USER_AGENT = 'webradio-website/0.1 (+https://github.com/YourEliteSystems/WebRadio)';

export type GitHubFailureCode =
  | 'GITHUB_TIMEOUT'
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_NOT_FOUND'
  | 'GITHUB_UNAVAILABLE'
  | 'GITHUB_INVALID_RESPONSE'
  | 'GITHUB_PRODUCT_MISMATCH';

export class GitHubError extends Error {
  readonly code: GitHubFailureCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: GitHubFailureCode,
    message: string,
    options: { status?: number | null; retryAfterSeconds?: number | null } = {},
  ) {
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

export type ReleaseChannel = 'stable' | 'beta' | 'alpha';

export type GitHubAsset = {
  name: string;
  size: number;
  digest: string | null;
  downloadUrl: string;
  platform: 'windows' | 'linux' | 'arch' | 'debian' | 'macos';
  platformLabel: string;
  format: string;
};

export type GitHubRelease = {
  id: number;
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  channel: ReleaseChannel;
  isPrerelease: boolean;
  notes: string;
  assets: GitHubAsset[];
};

export type GitHubRepository = {
  fullName: string;
  htmlUrl: string;
  description: string;
  defaultBranch: string;
  license: { name: string; spdxId: string; url: string | null } | null;
  homepage: string | null;
  topics: string[];
  archived: boolean;
  pushedAt: string | null;
};

export type GitHubSnapshot = {
  repository: GitHubRepository;
  releases: GitHubRelease[];
  latestStable: GitHubRelease | null;
  latestBeta: GitHubRelease | null;
  latestAlpha: GitHubRelease | null;
  fetchedAt: string;
  stale: boolean;
};

export type GitHubReadme = {
  excerpt: string;
  htmlUrl: string;
  fetchedAt: string;
  stale: boolean;
};

type CachedValue<T> = { data: T; fetchedAt: number; sourceUrl: string };

const responseCache = new Map<string, CachedValue<unknown>>();

const nullableString = z.string().nullable().optional();

const repositorySchema = z.object({
  full_name: z.string(),
  html_url: z.string(),
  description: nullableString,
  default_branch: z.string(),
  homepage: nullableString,
  topics: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
  pushed_at: nullableString,
  license: z
    .object({
      name: z.string(),
      spdx_id: nullableString,
      url: nullableString,
    })
    .nullable()
    .optional(),
});

const assetSchema = z.object({
  name: z.string(),
  size: z.number(),
  state: z.string().optional(),
  digest: nullableString,
  browser_download_url: z.string(),
});

const releaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: nullableString,
  html_url: z.string(),
  body: nullableString,
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: nullableString,
  assets: z.array(assetSchema),
});

const releasesSchema = z.array(releaseSchema);

function getToken(): string | null {
  const token = process.env['GITHUB_TOKEN']?.trim();
  return token ? token : null;
}

function githubHeaders(accept = 'application/vnd.github+json'): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function retryAfterFrom(response: Response): number | null {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.ceil(retryAfter);
  }

  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    const seconds = Math.ceil(reset - Date.now() / 1000);
    if (seconds > 0) {
      return seconds;
    }
  }

  return null;
}

async function fetchFromGitHub<T>(
  path: string,
  schema: z.ZodType<T>,
  accept?: string,
): Promise<CachedValue<T>> {
  const url = `${GITHUB_API_BASE}${path}`;
  const cached = responseCache.get(url) as CachedValue<T> | undefined;
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: githubHeaders(accept),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    if (cached && now - cached.fetchedAt <= MAX_STALE_AGE_MS) {
      // A usable, still bounded snapshot exists. The caller reports it as
      // stale; nothing is silently presented as fresh.
      return cached;
    }
    throw new GitHubError(
      isTimeout ? 'GITHUB_TIMEOUT' : 'GITHUB_UNAVAILABLE',
      isTimeout ? 'GitHub request timed out.' : 'GitHub could not be reached.',
    );
  }

  if (!response.ok) {
    const retryAfterSeconds = retryAfterFrom(response);

    if (response.status === 404) {
      throw new GitHubError('GITHUB_NOT_FOUND', 'GitHub resource not found.', {
        status: 404,
      });
    }

    if (
      response.status === 429 ||
      (response.status === 403 &&
        (retryAfterSeconds !== null ||
          response.headers.get('x-ratelimit-remaining') === '0'))
    ) {
      if (cached && now - cached.fetchedAt <= MAX_STALE_AGE_MS) {
        return cached;
      }
      throw new GitHubError('GITHUB_RATE_LIMITED', 'GitHub rate limit reached.', {
        status: response.status,
        retryAfterSeconds,
      });
    }

    if (cached && now - cached.fetchedAt <= MAX_STALE_AGE_MS) {
      return cached;
    }

    throw new GitHubError('GITHUB_UNAVAILABLE', 'GitHub returned an error.', {
      status: response.status,
    });
  }

  let raw: unknown;
  try {
    raw = accept?.includes('raw')
      ? await response.text()
      : await response.json();
  } catch {
    if (cached && now - cached.fetchedAt <= MAX_STALE_AGE_MS) {
      return cached;
    }
    throw new GitHubError(
      'GITHUB_INVALID_RESPONSE',
      'GitHub returned an unreadable response.',
      { status: response.status },
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    if (cached && now - cached.fetchedAt <= MAX_STALE_AGE_MS) {
      return cached;
    }
    throw new GitHubError(
      'GITHUB_INVALID_RESPONSE',
      'GitHub returned an unexpected payload.',
      { status: response.status },
    );
  }

  const entry: CachedValue<T> = {
    data: parsed.data,
    fetchedAt: now,
    sourceUrl: url,
  };
  responseCache.set(url, entry);
  return entry;
}

function safeRepositoryUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return null;
    }
    if (url.pathname.replace(/\/$/, '') !== `/${GITHUB_REPOSITORY}`) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeRepository(raw: z.infer<typeof repositorySchema>): GitHubRepository {
  const repositoryUrl = safeRepositoryUrl(raw.html_url);
  if (
    raw.full_name.toLowerCase() !== GITHUB_REPOSITORY.toLowerCase() ||
    !repositoryUrl ||
    raw.archived === true
  ) {
    throw new GitHubError(
      'GITHUB_PRODUCT_MISMATCH',
      'The GitHub repository does not match the WebRadio product scope.',
    );
  }

  return {
    fullName: GITHUB_REPOSITORY,
    htmlUrl: GITHUB_REPOSITORY_URL,
    description: raw.description?.trim() ?? '',
    defaultBranch: raw.default_branch,
    license: raw.license
      ? {
          name: raw.license.name,
          spdxId: raw.license.spdx_id?.trim() ?? '',
          url: raw.license.url ?? null,
        }
      : null,
    homepage: raw.homepage?.trim() || null,
    topics: (raw.topics ?? []).slice(0, 20),
    archived: false,
    pushedAt: raw.pushed_at ?? null,
  };
}

function releaseChannelFor(tagName: string, prerelease: boolean): ReleaseChannel {
  if (!prerelease) {
    return 'stable';
  }
  return tagName.toLowerCase().includes('alpha') ? 'alpha' : 'beta';
}

function safeReleaseUrl(raw: string, tagName: string): string | null {
  try {
    const url = new URL(raw);
    const expectedPath = `/${GITHUB_REPOSITORY}/releases/tag/${encodeURIComponent(tagName)}`;
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      decodeURIComponent(url.pathname) !== expectedPath
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * `browser_download_url` is the only download source. It must point at this
 * repository's release download path; arbitrary hosts from an API response are
 * rejected instead of being rendered as a button.
 */
function safeAssetUrl(raw: string, tagName: string): string | null {
  try {
    const url = new URL(raw);
    const expectedPrefix = `/${GITHUB_REPOSITORY}/releases/download/${tagName}/`;
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return null;
    }
    if (!decodeURIComponent(url.pathname).startsWith(expectedPrefix)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const ARTIFACT_TYPES: {
  pattern: RegExp;
  platform: GitHubAsset['platform'];
  platformLabel: string;
  format: string;
}[] = [
  {
    pattern: /\.AppImage$/i,
    platform: 'linux',
    platformLabel: 'Linux (x86_64)',
    format: 'AppImage',
  },
  {
    pattern: /\.pkg\.tar\.zst$/i,
    platform: 'arch',
    platformLabel: 'Arch Linux (x86_64)',
    format: 'Arch-Paket (.pkg.tar.zst)',
  },
  {
    pattern: /\.deb$/i,
    platform: 'debian',
    platformLabel: 'Debian / Ubuntu',
    format: 'Debian-Paket (.deb)',
  },
  {
    pattern: /\.exe$/i,
    platform: 'windows',
    platformLabel: 'Windows (x64)',
    format: 'Installer (EXE)',
  },
  {
    pattern: /\.dmg$/i,
    platform: 'macos',
    platformLabel: 'macOS',
    format: 'Disk Image (.dmg)',
  },
];

function parseAsset(
  raw: z.infer<typeof assetSchema>,
  tagName: string,
): GitHubAsset | null {
  // GitHub marks incomplete uploads explicitly. Metadata (`*.yml`,
  // `*.blockmap`, `SHA256SUMS.txt`) is not an installable artifact.
  if (raw.state && raw.state !== 'uploaded') {
    return null;
  }

  const type = ARTIFACT_TYPES.find((candidate) => candidate.pattern.test(raw.name));
  if (!type) {
    return null;
  }

  if (!Number.isSafeInteger(raw.size) || raw.size <= 0) {
    return null;
  }

  const downloadUrl = safeAssetUrl(raw.browser_download_url, tagName);
  if (!downloadUrl) {
    return null;
  }

  const digest =
    raw.digest && /^sha256:[0-9a-f]{64}$/i.test(raw.digest) ? raw.digest : null;

  return {
    name: raw.name,
    size: raw.size,
    digest,
    downloadUrl,
    platform: type.platform,
    platformLabel: type.platformLabel,
    format: type.format,
  };
}

function normalizeRelease(raw: z.infer<typeof releaseSchema>): GitHubRelease | null {
  // Drafts are never returned by the unauthenticated API, but a token-enabled
  // request could see them. Filtering here is the hard guarantee.
  if (raw.draft || !raw.published_at) {
    return null;
  }

  const htmlUrl = safeReleaseUrl(raw.html_url, raw.tag_name);
  if (!htmlUrl) {
    return null;
  }

  const channel = releaseChannelFor(raw.tag_name, raw.prerelease);

  return {
    id: raw.id,
    tagName: raw.tag_name,
    name: raw.name?.trim() || raw.tag_name,
    htmlUrl,
    publishedAt: raw.published_at,
    channel,
    isPrerelease: raw.prerelease,
    notes: (raw.body ?? '').trim().slice(0, 20_000),
    assets: raw.assets
      .map((asset) => parseAsset(asset, raw.tag_name))
      .filter((asset): asset is GitHubAsset => asset !== null),
  };
}

function newestByDate(releases: GitHubRelease[]): GitHubRelease[] {
  return [...releases].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

export async function getRepository(): Promise<{
  data: GitHubRepository;
  fetchedAt: string;
  stale: boolean;
}> {
  const cached = await fetchFromGitHub(
    `/repos/${GITHUB_REPOSITORY}`,
    repositorySchema,
  );

  return {
    data: normalizeRepository(cached.data),
    fetchedAt: new Date(cached.fetchedAt).toISOString(),
    stale: Date.now() - cached.fetchedAt >= CACHE_TTL_MS,
  };
}

export async function getReleases(): Promise<{
  data: GitHubRelease[];
  fetchedAt: string;
  stale: boolean;
}> {
  const cached = await fetchFromGitHub(
    `/repos/${GITHUB_REPOSITORY}/releases?per_page=${MAX_RELEASES}`,
    releasesSchema,
  );

  const releases = newestByDate(
    cached.data
      .map(normalizeRelease)
      .filter((release): release is GitHubRelease => release !== null),
  );

  return {
    data: releases,
    fetchedAt: new Date(cached.fetchedAt).toISOString(),
    stale: Date.now() - cached.fetchedAt >= CACHE_TTL_MS,
  };
}

/**
 * One coherent view for pages and the public release API. Repository metadata
 * and releases are cached separately, so a partial GitHub outage can still
 * serve the last known complete public snapshot.
 */
export async function getGitHubSnapshot(): Promise<GitHubSnapshot> {
  const [repository, releases] = await Promise.all([getRepository(), getReleases()]);

  const stable = releases.data.filter((release) => release.channel === 'stable');
  const beta = releases.data.filter((release) => release.channel === 'beta');
  const alpha = releases.data.filter((release) => release.channel === 'alpha');

  return {
    repository: repository.data,
    releases: releases.data,
    latestStable: stable[0] ?? null,
    latestBeta: beta[0] ?? null,
    latestAlpha: alpha[0] ?? null,
    fetchedAt:
      Date.parse(repository.fetchedAt) <= Date.parse(releases.fetchedAt)
        ? repository.fetchedAt
        : releases.fetchedAt,
    stale: repository.stale || releases.stale,
  };
}

/**
 * Convert the official README into a short plain-text excerpt. Nothing from
 * GitHub is rendered as HTML or Markdown: badges, images, HTML tags and link
 * targets are removed before the text reaches React.
 */
export function extractReadmeExcerpt(markdown: string, maxChars = 700): string {
  const withoutBadges = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s*\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/gm, '')
    .replace(/\[\s*\]\([^)]*\)/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\r/g, '');

  const paragraphs = withoutBadges
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 20 && !/^\[?!\[/.test(paragraph));

  const joined = paragraphs.slice(0, 2).join('\n\n');
  if (joined.length <= maxChars) {
    return joined;
  }

  const cut = joined.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()} …`;
}

export async function getReadme(): Promise<GitHubReadme | null> {
  try {
    const cached = await fetchFromGitHub(
      `/repos/${GITHUB_REPOSITORY}/readme`,
      z.string().max(500_000),
      'application/vnd.github.raw+json',
    );

    const excerpt = extractReadmeExcerpt(cached.data);
    if (!excerpt) {
      return null;
    }

    return {
      excerpt,
      htmlUrl: `${GITHUB_REPOSITORY_URL}#readme`,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      stale: Date.now() - cached.fetchedAt >= CACHE_TTL_MS,
    };
  } catch {
    // The README is supporting context, not a release source. A failure must
    // not break the page or invite placeholder prose.
    return null;
  }
}

/** Test-only hook: clear the per-instance response cache. */
export function __resetGitHubCacheForTests(): void {
  responseCache.clear();
}
