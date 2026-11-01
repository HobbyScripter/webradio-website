import {
  formatCompatibility,
  githubLinkLabel,
  isPreviewVersion,
  requiresNewerStable,
  shouldShowSortControls,
} from '@/lib/catalog-display';

describe('formatCompatibility', () => {
  it('renders an open-ended minimum as "ab X" instead of "X bis –"', () => {
    expect(formatCompatibility('1.4.0', null)).toBe('ab 1.4.0');
    expect(formatCompatibility(null, undefined)).toBeNull();
  });

  it('renders a closed range and an upper bound only', () => {
    expect(formatCompatibility('1.0.0', '2.0.0')).toBe('1.0.0 bis 2.0.0');
    expect(formatCompatibility(null, '2.0.0')).toBe('bis 2.0.0');
  });

  it('treats blank strings as missing', () => {
    expect(formatCompatibility('  ', undefined)).toBeNull();
    expect(formatCompatibility(' ', '2.0.0')).toBe('bis 2.0.0');
  });
});

describe('requiresNewerStable', () => {
  it('is true when the entry needs a version newer than the latest stable', () => {
    expect(requiresNewerStable('1.1.0', 'v1.0.6')).toBe(true);
  });

  it('is false for an equal or older requirement', () => {
    expect(requiresNewerStable('1.0.6', 'v1.0.6')).toBe(false);
    expect(requiresNewerStable('1.0.0', 'v1.0.6')).toBe(false);
  });

  it('is false when either side is unknown or not a version', () => {
    expect(requiresNewerStable(null, 'v1.0.6')).toBe(false);
    expect(requiresNewerStable('1.1.0', null)).toBe(false);
    expect(requiresNewerStable('1.1.0', 'nightly')).toBe(false);
  });

  it('compares numerically, not lexicographically', () => {
    expect(requiresNewerStable('1.10.0', '1.9.0')).toBe(true);
  });
});

describe('isPreviewVersion', () => {
  it('marks 0.x versions as previews', () => {
    expect(isPreviewVersion('0.9.1')).toBe(true);
    expect(isPreviewVersion('1.0.0')).toBe(false);
    expect(isPreviewVersion(null)).toBe(false);
  });
});

describe('githubLinkLabel', () => {
  it('labels a repository link as a repository', () => {
    expect(githubLinkLabel('https://github.com/YourEliteSystems/WebRadio')).toBe(
      'GitHub-Repository',
    );
    expect(githubLinkLabel('https://github.com/HobbyScripter/mediahub-plugin')).toBe(
      'GitHub-Repository',
    );
  });

  it('labels an account link as a profile', () => {
    expect(githubLinkLabel('https://github.com/HobbyScripter')).toBe(
      'GitHub-Profil von HobbyScripter',
    );
  });

  it('falls back to a neutral label', () => {
    expect(githubLinkLabel(null)).toBe('GitHub');
    expect(githubLinkLabel('not a url')).toBe('GitHub');
  });
});

describe('shouldShowSortControls', () => {
  it('hides sorting for a short single page', () => {
    expect(shouldShowSortControls(3, false)).toBe(false);
  });

  it('shows sorting beyond five entries or when more pages exist', () => {
    expect(shouldShowSortControls(6, false)).toBe(true);
    expect(shouldShowSortControls(6, true)).toBe(true);
    expect(shouldShowSortControls(9, true)).toBe(true);
  });
});
