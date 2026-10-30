/**
 * @jest-environment node
 */
import {
  GitHubRepositoryError,
  normalizeGitHubSourceUrl,
  parseGitHubRepositoryInput,
  tryParseGitHubRepositoryInput,
} from '../github-repository';

describe('parseGitHubRepositoryInput', () => {
  it.each([
    'https://github.com/owner/repo',
    'https://github.com/owner/repo/',
    'https://github.com/owner/repo.git',
    'https://github.com/owner/repo/tree/main',
    'https://github.com/owner/repo/tree/main/plugins/foo',
    'https://github.com/owner/repo/releases',
    'https://github.com/owner/repo/releases/tag/v1.2.3',
    'https://github.com/owner/repo?tab=readme-ov-file#readme',
    'github.com/owner/repo',
    'https://www.github.com/owner/repo',
  ])('reduces %s to owner and repository', (input) => {
    expect(parseGitHubRepositoryInput(input)).toEqual({
      owner: 'owner',
      repo: 'repo',
      fullName: 'owner/repo',
      repositoryUrl: 'https://github.com/owner/repo',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseGitHubRepositoryInput('  github.com/owner/repo  ').fullName).toBe('owner/repo');
  });

  it('rejects an empty input with a helpful message', () => {
    expect(() => parseGitHubRepositoryInput('   ')).toThrow(GitHubRepositoryError);
    expect(() => parseGitHubRepositoryInput('   ')).toThrow(/Bitte gib die GitHub-Repository-URL ein/);
  });

  it('rejects other hosts and look-alike domains', () => {
    for (const input of [
      'https://gitlab.com/owner/repo',
      'https://github.com.evil.example/owner/repo',
      'https://evilgithub.com/owner/repo',
      'https://api.github.com/repos/owner/repo',
    ]) {
      expect(() => parseGitHubRepositoryInput(input)).toThrow(/ausschließlich Links zu github.com/);
    }
  });

  it('rejects non-https, ports and embedded credentials', () => {
    expect(() => parseGitHubRepositoryInput('http://github.com/owner/repo')).toThrow(
      /https:\/\/-URL/,
    );
    expect(() => parseGitHubRepositoryInput('https://github.com:8443/owner/repo')).toThrow(
      /Anmeldedaten und keinen Port/,
    );
    expect(() => parseGitHubRepositoryInput('https://user:pass@github.com/owner/repo')).toThrow(
      /Anmeldedaten und keinen Port/,
    );
  });

  it('rejects URLs without a repository', () => {
    expect(() => parseGitHubRepositoryInput('https://github.com/owner')).toThrow(
      /enthält kein Repository/,
    );
    expect(() => parseGitHubRepositoryInput('https://github.com')).toThrow(
      /enthält kein Repository/,
    );
  });

  it('rejects invalid owner and repository names', () => {
    expect(() => parseGitHubRepositoryInput('https://github.com/own er/repo')).toThrow(
      /Owner oder Repository-Name ist ungültig/,
    );
    expect(() => parseGitHubRepositoryInput('https://github.com/owner/..')).toThrow();
  });

  it('rejects path traversal segments', () => {
    expect(() => parseGitHubRepositoryInput('https://github.com/owner/repo/../other')).toThrow(
      /ungültigen Pfad/,
    );
  });

  it('returns null from the non-throwing variant', () => {
    expect(tryParseGitHubRepositoryInput('not a url')).toBeNull();
    expect(tryParseGitHubRepositoryInput('github.com/owner/repo')?.fullName).toBe('owner/repo');
  });
});

describe('normalizeGitHubSourceUrl', () => {
  it('canonicalises repository and release links', () => {
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo/')).toBe(
      'https://github.com/owner/repo',
    );
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo',
    );
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo/tree/main')).toBe(
      'https://github.com/owner/repo',
    );
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo/releases')).toBe(
      'https://github.com/owner/repo/releases',
    );
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo/releases/latest')).toBe(
      'https://github.com/owner/repo/releases/latest',
    );
    expect(normalizeGitHubSourceUrl('https://github.com/owner/repo/releases/tag/v1.0.0')).toBe(
      'https://github.com/owner/repo/releases/tag/v1.0.0',
    );
  });

  it('rejects unrelated paths', () => {
    for (const value of [
      'https://github.com/owner',
      'https://github.com/owner/repo/issues/12',
      'https://github.com/owner/repo/releases/tag/v1.0.0/extra',
      'https://github.com/owner/repo/releases/tag/',
      'https://github.com/owner/repo/blob/main/file.zip',
    ]) {
      expect(normalizeGitHubSourceUrl(value)).toBeNull();
    }
  });
});
