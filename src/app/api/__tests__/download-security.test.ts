import { isValidGitHubReleaseDownloadUrl } from '../downloads/[assetId]/route';

describe('Download Endpoint URL & Redirect Security', () => {
  const releaseTag = 'v1.4.0';
  const fileName = 'WebRadio-Setup-1.4.0.exe';

  it('accepts strictly valid GitHub release download URL matching repository, tag, and filename', () => {
    const validUrl = `https://github.com/YourEliteSystems/WebRadio/releases/download/${releaseTag}/${fileName}`;
    expect(isValidGitHubReleaseDownloadUrl(validUrl, releaseTag, fileName)).toBe(true);
  });

  it('rejects URLs pointing to a different host (prevent Open Redirect)', () => {
    const maliciousHost = `https://evil-hacker.com/YourEliteSystems/WebRadio/releases/download/${releaseTag}/${fileName}`;
    expect(isValidGitHubReleaseDownloadUrl(maliciousHost, releaseTag, fileName)).toBe(false);
  });

  it('rejects URLs with protocol other than https', () => {
    const httpUrl = `http://github.com/YourEliteSystems/WebRadio/releases/download/${releaseTag}/${fileName}`;
    expect(isValidGitHubReleaseDownloadUrl(httpUrl, releaseTag, fileName)).toBe(false);
  });

  it('rejects URLs pointing to a different repository', () => {
    const otherRepo = `https://github.com/OtherUser/OtherApp/releases/download/${releaseTag}/${fileName}`;
    expect(isValidGitHubReleaseDownloadUrl(otherRepo, releaseTag, fileName)).toBe(false);
  });

  it('rejects URLs pointing to a different release tag', () => {
    const wrongTag = `https://github.com/YourEliteSystems/WebRadio/releases/download/v9.9.9/${fileName}`;
    expect(isValidGitHubReleaseDownloadUrl(wrongTag, releaseTag, fileName)).toBe(false);
  });

  it('rejects URLs with different file name', () => {
    const wrongFile = `https://github.com/YourEliteSystems/WebRadio/releases/download/${releaseTag}/malicious.bat`;
    expect(isValidGitHubReleaseDownloadUrl(wrongFile, releaseTag, fileName)).toBe(false);
  });

  it('rejects malformed or empty URLs', () => {
    expect(isValidGitHubReleaseDownloadUrl('not-a-url', releaseTag, fileName)).toBe(false);
    expect(isValidGitHubReleaseDownloadUrl('', releaseTag, fileName)).toBe(false);
  });
});

