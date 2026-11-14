/**
 * @jest-environment node
 *
 * Website analytics: path/referrer normalization, privacy filters, anonymous
 * aggregation and retention. The database is mocked.
 */
import {
  classifyDevice,
  classifyOs,
  cleanupAnalyticsRetention,
  detectArch,
  isBotUserAgent,
  isTrackingOptOut,
  normalizePagePath,
  recordDownloadRequest,
  referrerHost,
  trackPageView,
} from '../analytics/website';
import * as dbModule from '@/lib/db';

jest.mock('@/lib/db', () => {
  type Row = Record<string, unknown>;

  const state: { pageViews: Row[]; downloads: Row[] } = { pageViews: [], downloads: [] };

  const normalize = (value: unknown) =>
    value !== null && typeof value === 'object' ? String(value) : value;

  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => normalize(row[key]) === normalize(value));

  const makeModel = (store: Row[], prefix: string) => ({
    first: async (where: Row) => store.find((row) => matches(row, where)) ?? null,
    create: async (data: Row) => {
      const row = { id: `${prefix}-${store.length + 1}`, ...data };
      store.push(row);
      return row;
    },
    where: (arg: Row | ((row: Record<string, unknown>) => unknown)) => ({
      update: async (data: Row) => {
        const row = store.find((candidate) => matches(candidate, arg as Row));
        if (!row) throw new Error('row not found');
        Object.assign(row, data);
      },
      deleteAll: async () => {
        const predicate =
          typeof arg === 'function'
            ? (arg as (row: Record<string, unknown>) => { field: string; value: unknown })(
                new Proxy(
                  {},
                  {
                    get: (_target, field) => ({
                      lt: (value: unknown) => ({ field: String(field), value }),
                    }),
                  },
                ),
              )
            : null;

        const removed: Row[] = [];
        for (let index = store.length - 1; index >= 0; index -= 1) {
          const row = store[index];
          const drop = predicate
            ? String(row[predicate.field]) < String(predicate.value)
            : matches(row, arg as Row);
          if (drop) removed.push(store.splice(index, 1)[0]);
        }
        return removed;
      },
    }),
  });

  const orm = {
    public: {
      WebsitePageViewDaily: makeModel(state.pageViews, 'pv'),
      WebsiteDownloadRequestDaily: makeModel(state.downloads, 'dl'),
    },
  };

  return {
    __websiteState: state,
    db: {
      orm,
      transaction: async (fn: (tx: { orm: typeof orm }) => Promise<unknown>) => fn({ orm }),
    },
  };
});

const state = (
  dbModule as unknown as {
    __websiteState: { pageViews: Record<string, unknown>[]; downloads: Record<string, unknown>[] };
  }
).__websiteState;

function headers(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

beforeEach(() => {
  state.pageViews.length = 0;
  state.downloads.length = 0;
});

describe('normalizePagePath', () => {
  it('keeps the route and drops query, fragment and trailing slash', () => {
    expect(normalizePagePath('/downloads/?ref=x#top')).toBe('/downloads');
    expect(normalizePagePath('/')).toBe('/');
    expect(normalizePagePath('/news//entry')).toBe('/news/entry');
    expect(normalizePagePath('//news/entry')).toBeNull();
  });

  it('rejects absolute URLs, missing slashes and oversized paths', () => {
    expect(normalizePagePath('https://evil.example/x')).toBeNull();
    expect(normalizePagePath('downloads')).toBeNull();
    expect(normalizePagePath('/' + 'a'.repeat(300))).toBeNull();
    expect(normalizePagePath(42)).toBeNull();
  });

  it('excludes admin, auth, account and API routes', () => {
    for (const path of ['/admin', '/admin/users', '/auth/login', '/account/sessions', '/api/news']) {
      expect(normalizePagePath(path)).toBeNull();
    }
  });
});

describe('privacy helpers', () => {
  it('honors DNT and GPC', () => {
    expect(isTrackingOptOut(headers({ dnt: '1' }))).toBe(true);
    expect(isTrackingOptOut(headers({ 'sec-gpc': '1' }))).toBe(true);
    expect(isTrackingOptOut(headers())).toBe(false);
  });

  it('detects bots and prefetchers', () => {
    expect(isBotUserAgent('Googlebot/2.1')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 HeadlessChrome')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBe(false);
  });

  it('stores only the referrer hostname', () => {
    expect(referrerHost('https://www.google.com/search?q=webradio')).toBe('www.google.com');
    expect(referrerHost('javascript:alert(1)')).toBe('');
    expect(referrerHost(null)).toBe('');
  });

  it('classifies device and OS coarsely', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone) Mobile')).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (iPad)')).toBe('tablet');
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
    expect(classifyOs('Mozilla/5.0 (Windows NT 10.0)')).toBe('windows');
    expect(classifyOs('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('macos');
  });

  it('derives the architecture from the file name only', () => {
    expect(detectArch('WebRadio-win-arm64.exe')).toBe('arm64');
    expect(detectArch('WebRadio-linux-x86_64.AppImage')).toBe('x64');
    expect(detectArch('WebRadio.dmg')).toBe('');
  });
});

describe('trackPageView', () => {
  it('creates one anonymous aggregate and increments it on repeat views', async () => {
    const input = {
      path: '/downloads?utm=mail',
      referrer: 'https://github.com/YourEliteSystems/WebRadio',
      headers: headers({
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
        'x-vercel-ip-country': 'de',
      }),
      now: new Date('2026-11-14T10:00:00Z'),
    };

    await trackPageView(input);
    await trackPageView({ ...input, now: new Date('2026-11-14T18:00:00Z') });

    expect(state.pageViews).toHaveLength(1);
    expect(state.pageViews[0]).toMatchObject({
      path: '/downloads',
      referrerHost: 'github.com',
      countryCode: 'DE',
      deviceType: 'desktop',
      os: 'windows',
      count: 2,
    });
  });

  it('does not store the user agent or any client identifier', async () => {
    await trackPageView({
      path: '/',
      headers: headers({ 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130' }),
      now: new Date('2026-11-14T10:00:00Z'),
    });

    const stored = JSON.stringify(state.pageViews[0]);
    expect(stored).not.toContain('Firefox');
    expect(stored).not.toContain('127.0.0.1');
  });
});

describe('recordDownloadRequest', () => {
  it('aggregates asset, channel, arch, country and referrer host', async () => {
    await recordDownloadRequest({
      assetId: 'asset-1',
      releaseTag: 'v2.0.0',
      channel: 'stable',
      platform: 'windows',
      fileName: 'WebRadio-2.0.0-win-x64.exe',
      referrer: 'https://webradio.example/downloads',
      headers: headers({ 'cf-ipcountry': 'AT' }),
      now: new Date('2026-11-14T10:00:00Z'),
    });

    expect(state.downloads).toHaveLength(1);
    expect(state.downloads[0]).toMatchObject({
      assetId: 'asset-1',
      releaseTag: 'v2.0.0',
      channel: 'stable',
      platform: 'windows',
      arch: 'x64',
      countryCode: 'AT',
      referrerHost: 'webradio.example',
      count: 1,
    });
  });
});

describe('cleanupAnalyticsRetention', () => {
  it('deletes only aggregates older than the retention window', async () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const old = Temporal.Instant.from('2026-07-01T00:00:00Z');
    const recent = Temporal.Instant.from('2026-11-01T00:00:00Z');
    state.pageViews.push(
      { id: 'old-pv', day: old, path: '/', count: 1 },
      { id: 'new-pv', day: recent, path: '/', count: 1 },
    );
    state.downloads.push(
      { id: 'old-dl', day: old, assetId: 'a', count: 1 },
      { id: 'new-dl', day: recent, assetId: 'a', count: 1 },
    );

    const result = await cleanupAnalyticsRetention({ now });

    expect(result).toEqual({ pageViewsDeleted: 1, downloadRequestsDeleted: 1 });
    expect(state.pageViews.map((row) => row.id)).toEqual(['new-pv']);
    expect(state.downloads.map((row) => row.id)).toEqual(['new-dl']);
  });
});
