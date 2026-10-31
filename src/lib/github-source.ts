import { gitHubSourceUrlSchema } from './validations';

class GitHubSourceError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'GitHubSourceError';
  }
}

export function extractGitHubRepository(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedGitHubSourceUrl(value: string): boolean {
  return gitHubSourceUrlSchema.safeParse(value).success;
}

export function validateGitHubSourceUrl(value: string): string {
  const parsed = gitHubSourceUrlSchema.safeParse(value);
  if (!parsed.success) {
    throw new GitHubSourceError(
      parsed.error.issues.map((issue) => issue.message).join(' '),
    );
  }
  return parsed.data;
}

export function normalizeGitHubSourceUrl(value: string): string {
  return validateGitHubSourceUrl(value);
}

export function isGitHubSourceUrl(value: string): boolean {
  try {
    return new URL(value).hostname === 'github.com';
  } catch {
    return false;
  }
}

// Aliases
export const validateGitHubUrl = validateGitHubSourceUrl;
export const normalizeGitHubUrl = normalizeGitHubSourceUrl;
export const isAllowedGitHubUrl = isAllowedGitHubSourceUrl;