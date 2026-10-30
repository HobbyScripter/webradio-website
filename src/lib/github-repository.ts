/**
 * Parsing and canonicalisation of user-supplied GitHub URLs.
 *
 * Plugin developers usually know one thing: the address of their repository.
 * They should not have to care about branches, sub-pages or API endpoints, so
 * this module reduces every accepted spelling to `owner` and `repo`:
 *
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/main
 *   https://github.com/owner/repo/tree/main/plugins/foo
 *   https://github.com/owner/repo/releases
 *   https://github.com/owner/repo/releases/tag/v1.2.3
 *   https://github.com/owner/repo?tab=readme-ov-file#readme
 *   github.com/owner/repo                     (scheme is added)
 *
 * Anything else is rejected. The returned values are used to build the GitHub
 * API URL, so the owner and repository names are validated against GitHub's own
 * naming rules and can never contain path separators, dots-only segments or
 * scheme/host fragments. Only `github.com` (and its `www.` alias) is accepted;
 * look-alike hosts such as `github.com.example.org` are refused.
 */

export type GitHubRepositoryRef = {
  owner: string;
  repo: string;
  /** `owner/repo`, preserving the spelling the developer used. */
  fullName: string;
  /** Canonical `https://github.com/owner/repo` URL. */
  repositoryUrl: string;
};

export type GitHubRepositoryErrorCode =
  | 'GITHUB_URL_EMPTY'
  | 'GITHUB_URL_INVALID'
  | 'GITHUB_HOST_INVALID'
  | 'GITHUB_REPOSITORY_MISSING';

export class GitHubRepositoryError extends Error {
  readonly code: GitHubRepositoryErrorCode;
  readonly status = 400;

  constructor(code: GitHubRepositoryErrorCode, message: string) {
    super(message);
    this.name = 'GitHubRepositoryError';
    this.code = code;
  }
}

/** GitHub login rules: alphanumeric and single hyphens, max 39 characters. */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** Repository names may also contain dots and underscores. */
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const ALLOWED_HOSTS = new Set(['github.com', 'www.github.com']);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment.length > 0);
}

function stripDotGit(repo: string): string {
  return repo.toLowerCase().endsWith('.git') ? repo.slice(0, -4) : repo;
}

/**
 * Parse a developer-supplied GitHub URL into its owner and repository.
 *
 * Throws a `GitHubRepositoryError` with a message that is safe and useful to
 * show in the form.
 */
export function parseGitHubRepositoryInput(raw: string): GitHubRepositoryRef {
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new GitHubRepositoryError(
      'GITHUB_URL_EMPTY',
      'Bitte gib die GitHub-Repository-URL ein, zum Beispiel https://github.com/OWNER/REPOSITORY.',
    );
  }

  if (trimmed.length > 300) {
    throw new GitHubRepositoryError('GITHUB_URL_INVALID', 'Die GitHub-URL ist zu lang.');
  }

  // `new URL()` resolves `..` silently, which would turn `/owner/repo/../x`
  // into `/owner/x`. Reject traversal before the URL parser sees it.
  const rawPath = trimmed.replace(SCHEME_PATTERN, '').split(/[?#]/)[0] ?? '';
  if (rawPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new GitHubRepositoryError(
      'GITHUB_URL_INVALID',
      'Die GitHub-URL enthält einen ungültigen Pfad.',
    );
  }

  const withScheme = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new GitHubRepositoryError(
      'GITHUB_URL_INVALID',
      'Die GitHub-URL ist ungültig. Erwartet wird https://github.com/OWNER/REPOSITORY.',
    );
  }

  if (url.protocol !== 'https:') {
    throw new GitHubRepositoryError(
      'GITHUB_URL_INVALID',
      'Bitte verwende eine https://-URL. Erwartet wird https://github.com/OWNER/REPOSITORY.',
    );
  }

  if (url.username || url.password || url.port) {
    throw new GitHubRepositoryError(
      'GITHUB_URL_INVALID',
      'Die GitHub-URL darf keine Anmeldedaten und keinen Port enthalten.',
    );
  }

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new GitHubRepositoryError(
      'GITHUB_HOST_INVALID',
      'Es werden ausschließlich Links zu github.com unterstützt. Erwartet wird https://github.com/OWNER/REPOSITORY.',
    );
  }

  const segments = segmentsOf(url.pathname);
  if (segments.length < 2) {
    throw new GitHubRepositoryError(
      'GITHUB_REPOSITORY_MISSING',
      'Die URL enthält kein Repository. Erwartet wird https://github.com/OWNER/REPOSITORY.',
    );
  }

  const owner = segments[0]!;
  const repo = stripDotGit(segments[1]!);

  if (!OWNER_PATTERN.test(owner) || !REPOSITORY_PATTERN.test(repo)) {
    throw new GitHubRepositoryError(
      'GITHUB_URL_INVALID',
      'Owner oder Repository-Name ist ungültig. Erlaubt sind Buchstaben, Zahlen, Bindestriche, Punkte und Unterstriche.',
    );
  }

  // Sub-pages such as /tree/main, /releases or /issues/12 are accepted and
  // ignored. Traversal segments are rejected rather than silently dropped.
  if (segments.slice(2).some((segment) => segment === '.' || segment === '..')) {
    throw new GitHubRepositoryError(
      'GITHUB_URL_INVALID',
      'Die GitHub-URL enthält einen ungültigen Pfad.',
    );
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    repositoryUrl: `https://github.com/${owner}/${repo}`,
  };
}

/** Non-throwing variant for validation pipelines. */
export function tryParseGitHubRepositoryInput(raw: string): GitHubRepositoryRef | null {
  try {
    return parseGitHubRepositoryInput(raw);
  } catch {
    return null;
  }
}

/**
 * Canonical form of a GitHub URL that is stored as a download source.
 *
 * - repository and branch/tree links become the repository URL,
 * - release links are reduced to `/releases`, `/releases/latest` or
 *   `/releases/tag/<tag>`,
 * - every other path is rejected (`null`).
 *
 * Callers must only pass URLs whose host is already known to be `github.com`.
 */
export function normalizeGitHubSourceUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const segments = segmentsOf(url.pathname);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0]!;
  const repo = stripDotGit(segments[1]!);
  if (!OWNER_PATTERN.test(owner) || !REPOSITORY_PATTERN.test(repo)) {
    return null;
  }

  const base = `https://github.com/${owner}/${repo}`;
  const rest = segments.slice(2);

  if (rest.length === 0) {
    return base;
  }

  // A branch link is not a download. Reducing it to the repository makes the
  // pasted address usable instead of rejecting it.
  if (rest[0] === 'tree') {
    return base;
  }

  if (rest[0] === 'releases') {
    if (rest.length === 1) {
      return `${base}/releases`;
    }
    if (rest[1] === 'latest' && rest.length === 2) {
      return `${base}/releases/latest`;
    }
    if (rest[1] === 'tag' && rest.length === 3 && rest[2]) {
      return `${base}/releases/tag/${rest[2]}`;
    }
    return null;
  }

  return null;
}
