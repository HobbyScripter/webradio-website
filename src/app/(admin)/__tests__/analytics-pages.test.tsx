/**
 * @jest-environment jsdom
 *
 * Analytics admin pages: separated GitHub/website totals, explicit request
 * semantics, empty states and controlled error panels.
 */
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  usePathname: () => '/admin/analytics',
}));

jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  connection: async () => undefined,
}));

jest.mock('@/lib/analytics/queries', () => ({
  parseAnalyticsWindow: (value: string | undefined) =>
    value === '7' ? 7 : value === '90' ? 90 : 30,
  getAnalyticsOverview: jest.fn(),
  getTrafficAnalytics: jest.fn(),
  getDownloadRequestAnalytics: jest.fn(),
  getWebsiteAnalytics: jest.fn(),
}));

import { renderToStaticMarkup } from 'react-dom/server';
import AnalyticsOverviewPage from '../admin/analytics/page';
import TrafficPage from '../admin/analytics/traffic/page';
import DownloadRequestsPage from '../admin/analytics/downloads/page';
import WebsitePage from '../admin/analytics/website/page';
import {
  getAnalyticsOverview,
  getDownloadRequestAnalytics,
  getTrafficAnalytics,
  getWebsiteAnalytics,
} from '@/lib/analytics/queries';

const overviewMock = jest.mocked(getAnalyticsOverview);
const trafficMock = jest.mocked(getTrafficAnalytics);
const downloadsMock = jest.mocked(getDownloadRequestAnalytics);
const websiteMock = jest.mocked(getWebsiteAnalytics);

async function render(page: Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await page);
}

beforeEach(() => {
  overviewMock.mockReset();
  trafficMock.mockReset();
  downloadsMock.mockReset();
  websiteMock.mockReset();
});

it('overview renders GitHub and website figures separately', async () => {
  overviewMock.mockResolvedValue({
    github: { views7: 1234, clones7: 12, stars: 99, assets: 8, totalDownloads: 4321 },
    website: { pageViews7: 56, downloadRequests7: 7 },
    sync: { lastSuccessAt: '2026-11-14T10:00:00Z', failingSources: 1 },
    unavailable: [],
  });

  const html = await render(AnalyticsOverviewPage());

  expect(html).toContain('GitHub-Aufrufe (7 Tage)');
  expect(html).toContain('1.234');
  expect(html).toContain('Seitenaufrufe (7 Tage)');
  expect(html).toContain('56');
  expect(html).toContain('Anfragen, keine bestätigten Downloads');
});

it('overview shows a dash instead of an invented value when a source fails', async () => {
  overviewMock.mockResolvedValue({
    github: { views7: null, clones7: null, stars: null, assets: null, totalDownloads: null },
    website: { pageViews7: null, downloadRequests7: null },
    sync: null,
    unavailable: ['Traffic'],
  });

  const html = await render(AnalyticsOverviewPage());

  expect(html).toContain('Einige Quellen nicht verfügbar');
  expect(html).toContain('Traffic');
  expect(html).toContain('–');
});

it('traffic page renders an empty state without traffic data', async () => {
  trafficMock.mockResolvedValue({
    days: 30,
    totals: { views: 0, uniqueVisitors: 0, clones: 0, uniqueClones: 0 },
    daily: [],
    referrers: [],
    paths: [],
    capturedFor: null,
  });

  const html = await render(
    TrafficPage({ searchParams: Promise.resolve({ days: '7' }) }),
  );

  expect(html).toContain('Noch keine Traffic-Daten');
  expect(html).toContain('14 Tage');
});

it('download page labels requests as requests', async () => {
  downloadsMock.mockResolvedValue({
    days: 30,
    totalRequests: 42,
    daily: [{ day: '2026-11-14', count: 5 }],
    byChannel: [{ label: 'stable', count: 40 }],
    byPlatform: [{ label: 'windows', count: 30 }],
    byArch: [{ label: 'x64', count: 25 }],
    byCountry: [{ label: 'DE', count: 20 }],
  });

  const html = await render(
    DownloadRequestsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('Anfragen gesamt');
  expect(html).toContain('42');
  expect(html).toContain('Ein bestätigter erfolgreicher Download ist damit nicht belegt');
});

it('website page renders a controlled error instead of throwing', async () => {
  websiteMock.mockRejectedValue(new Error('relation does not exist'));

  const html = await render(WebsitePage({ searchParams: Promise.resolve({}) }));

  expect(html).toContain('Website-Analytics nicht verfügbar');
  expect(html).toContain('keine Ersatzzahlen');
});
