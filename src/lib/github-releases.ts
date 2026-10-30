/**
 * Server-side lookup of releases for a developer-supplied repository.
 *
 * The browser never talks to GitHub: this module builds the only URL that is
 * allowed (`api.github.com/repos/<owner>/<repo>/releases`), sends the optional
 * server-side token and returns a reduced, validated payload. Owner and
 * repository come from `github-repository.ts`, so a caller can not redirect the
 * request to another host or path (SSRF).
 *
 * Security properties:
 *   - only https://github.com/... and https://api.github.com/... are contacted,
 *   - release and asset links from the API payload are re-checked against the
 *     requested repository instead of being trusted,
 *   - drafts are never returned, pre-releases are flagged but not hidden,
 *   - no token, no request headers and no raw API error body leave this module.
 *
 * Caching: five minutes per repository and server instance. When GitHub fails
 * and a snapshot younger than 24 hours exists, that snapshot is returned with
 * `stale: true` instead of pretending the data is fresh.
 */
import { z } from 'zod';
import {
  parseGitHubRepositoryInput,
  type GitHubRepositoryRef,
} from './github-repository';

const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_STALE_AGE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_RELEASES = 50;
const MAX_RETURNED_RELEASES = 30;
const MAX_NOTES_CHARS = 2_000;
const MAX_ASSETS = 10;
const USER_AGENT = 'webradio-website/0.1 (+https://github.com/YourEliteSystems/WebRadio)';

export type GitHubReleaseErrorCode =
  | 'GITHUB_NOT_FOUND'
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_UNAVAILABLE'
  | 'GITHUB_TIMEOUT'
  | 'GITHUB_INVALID_RESPONSE';

/** Message shown to developers. Never contains technical API details. */
const ERROR_MESSAGES: Record<GitHubReleaseErrorCode, string> = {
  GITHUB_NOT_FOUND:
    'Repository nicht gefunden. Prüfe die Schreibweise oder ob das Repository privat ist.',
  GITHUB_RATE_LIMITED:
    'GitHub limitiert gerade die Anfragen. Bitte versuche es in ein paar Minuten erneut oder trage die Version manuell ein.',
  GITHUB_UNAVAILABLE:
    'GitHub ist vorübergehend nicht erreichbar. Bitte trage die Version manuell ein.',
  GITHUB_TIMEOUT:
    'GitHub hat nicht rechtzeitig geantwortet. Bitte trage die Version manuell ein.',
  GITHUB_INVALID_RESPONSE:
    'GitHub hat eine unerwartete Antwort geliefert. Bitte trage die Version manuell ein.',
};

export class GitHubReleaseError extends Error {
  readonly code: GitHubReleaseErrorCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: GitHubReleaseErrorCode,
    options: { status?: number | null; retryAfterSeconds?: number | null } = {},
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GitHubReleaseError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

export type GitHubReleaseAssetOption = {
  name: string;
  size: number;
  downloadUrl: string;
  /** `sha256:...` when GitHub provides a digest, otherwise null. */
  digest: string | null;
  contentType: string | null;
};

export type GitHubReleaseOption = {
  id: number;
  tagName: string;
  /** Three-part version for the form, or null when the tag is not semver. */
  version: string | null;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  isPrerelease: boolean;
  notes: string;
  assets: GitHubReleaseAssetOption[];
};

export type GitHubReleaseList = {
  repository: { fullName: string; url: string };
  releases: GitHubReleaseOption[];
  fetchedAt: string;
  stale: boolean;
};

type CachedList = { data: GitHubReleaseList; fetchedAtMs: number };

const releaseCache = new Map<string, CachedList>();

const assetSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number(),
  state: z.string().optional(),
  digest: z.string().nullable().optional(),
  content_type: z.string().optional(),
  browser_download_url: z.string(),
});

const releaseSchema = z.object({
  id: z.number(),
  tag_name: z.string().min(1).max(200),
  name: z.string().nullable().optional(),
  html_url: z.string(),
  body: z.string().nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable().optional(),
  assets: z.array(assetSchema),
});

const releasesSchema = z.array(releaseSchema);

/** `v1.2.3`, `1.2.3` and `1.2.3-beta.1` all map to `1.2.3`; the tag stays visible. */
export function tagToVersion(tag: string): string | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/i.exec(tag.trim());
  if (!match) {
    return null;
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = process.env['GITHUB_TOKEN']?.trim();
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

function isSameRepositoryPath(pathname: string, ref: GitHubRepositoryRef): boolean {
  const expectedPrefix = `/${ref.owner}/${ref.repo}`.toLowerCase();
  return pathname.toLowerCase().startsWith(expectedPrefix);
}

function safeReleasePageUrl(
  raw: string,
  ref: GitHubRepositoryRef,
  tagName: string,
): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return null;
    }
    if (!isSameRepositoryPath(url.pathname, ref)) {
      return null;
    }
    const expected = `/${ref.owner}/${ref.repo}/releases/tag/${tagName}`.toLowerCase();
    return decodeURIComponent(url.pathname).toLowerCase() === expected ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeAssetDownloadUrl(raw: string, ref: GitHubRepositoryRef): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return null;
    }
    if (!isSameRepositoryPath(url.pathname, ref)) {
      return null;
    }
    return decodeURIComponent(url.pathname)
      .toLowerCase()
      .includes(`/${ref.owner}/${ref.repo}/releases/download/`.toLowerCase())
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeAsset(
  raw: z.infer<typeof assetSchema>,
  ref: GitHubRepositoryRef,
): GitHubReleaseAssetOption | null {
  // An incomplete upload is not a downloadable file, and zero-byte assets
  // cannot satisfy the catalogue's `fileSize > 0` rule.
  if (raw.state && raw.state !== 'uploaded') {
    return null;
  }
  if (!Number.isSafeInteger(raw.size) || raw.size <= 0) {
    return null;
  }

  const downloadUrl = safeAssetDownloadUrl(raw.browser_download_url, ref);
  if (!downloadUrl) {
    return null;
  }

  const digest =
    raw.digest && /^sha256:[0-9a-f]{64}$/i.test(raw.digest) ? raw.digest : null;

  return {
    name: raw.name,
    size: raw.size,
    downloadUrl,
    digest,
    contentType: raw.content_type?.trim() || null,
  };
}

function normalizeRelease(
  raw: z.infer<typeof releaseSchema>,
  ref: GitHubRepositoryRef,
): GitHubReleaseOption | null {
  // Drafts are only visible with a token; they must never appear as options.
  if (raw.draft || !raw.published_at) {
    return null;
  }

  const htmlUrl = safeReleasePageUrl(raw.html_url, ref, raw.tag_name);
  if (!htmlUrl) {
    return null;
  }

  return {
    id: raw.id,
    tagName: raw.tag_name,
    version: tagToVersion(raw.tag_name),
    name: raw.name?.trim() || raw.tag_name,
    publishedAt: raw.published_at,
    htmlUrl,
    isPrerelease: raw.prerelease,
    notes: (raw.body ?? '').trim().slice(0, MAX_NOTES_CHARS),
    assets: raw.assets
      .map((asset) => normalizeAsset(asset, ref))
      .filter((asset): asset is GitHubReleaseAssetOption => asset !== null)
      .slice(0, MAX_ASSETS),
  };
}

function cachedFallback(key: string, nowMs: number): GitHubReleaseList | null {
  const cached = releaseCache.get(key);
  if (!cached) {
    return null;
  }
  if (nowMs - cached.fetchedAtMs > MAX_STALE_AGE_MS) {
    return null;
  }
  return { ...cached.data, stale: true };
}

/**
 * Fetch published releases of one repository.
 *
 * The URL passed by the developer is parsed here, so callers can hand over the
 * raw form value without touching GitHub themselves.
 */
export async function listGitHubReleases(rawUrl: string): Promise<GitHubReleaseList> {
  const ref = parseGitHubRepositoryInput(rawUrl);
  return listRepositoryReleases(ref);
}

export async function listRepositoryReleases(
  ref: GitHubRepositoryRef,
): Promise<GitHubReleaseList> {
  const key = ref.fullName.toLowerCase();
  const nowMs = Date.now();
  const cached = releaseCache.get(key);

  if (cached && nowMs - cached.fetchedAtMs < CACHE_TTL_MS) {
    return cached.data;
  }

  // Only the fixed API host with a validated owner/repository is requested.
  const apiUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
    ref.repo,
  )}/releases?per_page=${MAX_RELEASES}`;

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    const fallback = cachedFallback(key, nowMs);
    if (fallback) {
      return fallback;
    }
    throw new GitHubReleaseError(isTimeout ? 'GITHUB_TIMEOUT' : 'GITHUB_UNAVAILABLE');
  }

  if (!response.ok) {
    if (response.status === 404) {
      // A deleted or private repository must not be masked by an old snapshot.
      releaseCache.delete(key);
      throw new GitHubReleaseError('GITHUB_NOT_FOUND', { status: 404 });
    }

    const retryAfterSeconds = retryAfterFrom(response);
    const rateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (retryAfterSeconds !== null ||
          response.headers.get('x-ratelimit-remaining') === '0'));

    const fallback = cachedFallback(key, nowMs);
    if (fallback) {
      return fallback;
    }

    throw new GitHubReleaseError(rateLimited ? 'GITHUB_RATE_LIMITED' : 'GITHUB_UNAVAILABLE', {
      status: response.status,
      retryAfterSeconds,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const fallback = cachedFallback(key, nowMs);
    if (fallback) {
      return fallback;
    }
    throw new GitHubReleaseError('GITHUB_INVALID_RESPONSE', { status: response.status });
  }

  const parsed = releasesSchema.safeParse(payload);
  if (!parsed.success) {
    const fallback = cachedFallback(key, nowMs);
    if (fallback) {
      return fallback;
    }
    throw new GitHubReleaseError('GITHUB_INVALID_RESPONSE', { status: response.status });
  }

  const releases = parsed.data
    .map((release) => normalizeRelease(release, ref))
    .filter((release): release is GitHubReleaseOption => release !== null)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_RETURNED_RELEASES);

  const data: GitHubReleaseList = {
    repository: { fullName: ref.fullName, url: ref.repositoryUrl },
    releases,
    fetchedAt: new Date(nowMs).toISOString(),
    stale: false,
  };

  releaseCache.set(key, { data, fetchedAtMs: nowMs });
  return data;
}

/** Test-only hook: clear the per-instance release cache. */
export function __resetGitHubReleaseCacheForTests(): void {
  releaseCache.clear();
}
