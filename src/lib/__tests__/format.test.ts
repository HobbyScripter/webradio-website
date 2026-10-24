import {
  formatDate,
  formatFileSize,
  formatNumber,
  releaseChannel,
  releaseChannelLabel,
} from '../format';

describe('formatDate', () => {
  it('formats an ISO timestamp in German and rejects invalid input', () => {
    expect(formatDate('2026-10-24T12:00:00.000Z')).toBe('24. Oktober 2026');
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('not-a-date')).toBeNull();
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1,5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('rejects negative and non-finite values', () => {
    expect(formatFileSize(-1)).toBeNull();
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatFileSize(null)).toBeNull();
  });
});

describe('release channels', () => {
  it('derives stable and beta from SemVer prerelease syntax', () => {
    expect(releaseChannel('1.2.3')).toBe('stable');
    expect(releaseChannel('1.2.3-beta.1')).toBe('beta');
    expect(releaseChannelLabel('0.1.0-alpha')).toBe('Beta');
    expect(releaseChannelLabel('1.0.0')).toBe('Stabil');
  });
});

describe('formatNumber', () => {
  it('formats using German grouping', () => {
    expect(formatNumber(1234)).toMatch(/1[.\u00a0]234/);
  });
});
