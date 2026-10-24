import { absoluteUrl, getSiteUrl, safeHttpUrl } from '../site';

describe('safeHttpUrl', () => {
  it('accepts absolute HTTP(S) URLs', () => {
    expect(safeHttpUrl('https://example.com/file.zip')).toBe('https://example.com/file.zip');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects unsafe or malformed URLs', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('/relative/path')).toBeNull();
    expect(safeHttpUrl('https://user:pass@example.com/file.zip')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });
});

describe('public site URL', () => {
  const original = process.env['NEXT_PUBLIC_SITE_URL'];

  afterEach(() => {
    if (original === undefined) {
      delete process.env['NEXT_PUBLIC_SITE_URL'];
    } else {
      process.env['NEXT_PUBLIC_SITE_URL'] = original;
    }
  });

  it('returns null when no base URL is configured', () => {
    delete process.env['NEXT_PUBLIC_SITE_URL'];
    expect(getSiteUrl()).toBeNull();
    expect(absoluteUrl('/plugins')).toBeUndefined();
  });

  it('normalizes a valid base URL and builds absolute paths', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://webradio.example/subpage';
    expect(getSiteUrl()).toBe('https://webradio.example');
    expect(absoluteUrl('/plugins')).toBe('https://webradio.example/plugins');
  });

  it('ignores invalid or non-HTTP(S) base URLs', () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'javascript:alert(1)';
    expect(getSiteUrl()).toBeNull();

    process.env['NEXT_PUBLIC_SITE_URL'] = 'not-a-url';
    expect(getSiteUrl()).toBeNull();
  });
});
