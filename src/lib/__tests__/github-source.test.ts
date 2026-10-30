import { gitHubSourceUrlSchema } from '../validations';
import { isAllowedGitHubSourceUrl } from '../github-source';

describe('GitHub source URL validation', () => {
  it('accepts repository URLs', () => {
    expect(gitHubSourceUrlSchema.safeParse('https://github.com/owner/repo').success).toBe(true);
    expect(gitHubSourceUrlSchema.safeParse('https://github.com/owner/repo/').success).toBe(true);
  });

  it('accepts release URLs', () => {
    expect(gitHubSourceUrlSchema.safeParse('https://github.com/owner/repo/releases').success).toBe(true);
    expect(gitHubSourceUrlSchema.safeParse('https://github.com/owner/repo/releases/tag/v1.0.0').success).toBe(true);
    expect(gitHubSourceUrlSchema.safeParse('https://github.com/owner/repo/releases/latest').success).toBe(true);
  });

  it('rejects other hosts, subdomains and lookalikes', () => {
    for (const url of [
      'https://www.github.com/owner/repo',
      'https://github.com.evil.example/owner/repo',
      'https://evilgithub.com/owner/repo',
      'http://github.com/owner/repo',
    ]) {
      expect(gitHubSourceUrlSchema.safeParse(url).success).toBe(false);
      expect(isAllowedGitHubSourceUrl(url)).toBe(false);
    }
  });

  it('rejects invalid paths, empty and malformed URLs', () => {
    for (const url of [
      '',
      'not-a-url',
      'https://github.com',
      'https://github.com/owner',
      'https://github.com/owner/repo/extra/path',
      'https://github.com/owner/repo/releases/tag/',
    ]) {
      expect(gitHubSourceUrlSchema.safeParse(url).success).toBe(false);
    }
  });

  it('drops query parameters and fragments instead of rejecting the link', () => {
    expect(gitHubSourceUrlSchema.parse('https://github.com/owner/repo?x=1')).toBe(
      'https://github.com/owner/repo',
    );
    expect(gitHubSourceUrlSchema.parse('https://github.com/owner/repo#frag')).toBe(
      'https://github.com/owner/repo',
    );
    expect(
      gitHubSourceUrlSchema.parse('https://github.com/owner/repo/releases/tag/v1.0.0?tab=readme'),
    ).toBe('https://github.com/owner/repo/releases/tag/v1.0.0');
  });

  it('reduces branch links to the repository address', () => {
    // A `/tree/<branch>` page is what developers copy most often.
    expect(gitHubSourceUrlSchema.parse('https://github.com/owner/repo/tree/main')).toBe(
      'https://github.com/owner/repo',
    );
    expect(gitHubSourceUrlSchema.parse('https://github.com/owner/repo/tree/feature/x/plugins')).toBe(
      'https://github.com/owner/repo',
    );
    expect(gitHubSourceUrlSchema.parse('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('still allows ordinary non-GitHub file URLs', () => {
    expect(gitHubSourceUrlSchema.safeParse('https://example.com/plugin.zip').success).toBe(true);
    expect(gitHubSourceUrlSchema.safeParse('http://localhost:3000/file.zip').success).toBe(true);
  });
});