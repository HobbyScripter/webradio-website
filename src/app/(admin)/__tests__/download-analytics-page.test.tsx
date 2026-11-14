/**
 * @jest-environment jsdom
 *
 * The admin download page must render real totals, an explicit empty state and
 * a controlled error state. A failing database query may not throw into the
 * global error boundary.
 */
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

jest.mock('@/lib/server-auth', () => ({
  getServerAuthSession: jest.fn(),
}));

jest.mock('@/lib/download-analytics-service', () => ({
  getDownloadAnalyticsData: jest.fn(),
}));

jest.mock('../admin/downloads/sync-button', () => ({
  __esModule: true,
  default: () => <span>Sync</span>,
}));

import { renderToStaticMarkup } from 'react-dom/server';
import DownloadAnalyticsPage from '../admin/downloads/page';
import { getServerAuthSession } from '@/lib/server-auth';
import {
  getDownloadAnalyticsData,
  type DownloadAnalyticsDashboardData,
} from '@/lib/download-analytics-service';

const mockSession = jest.mocked(getServerAuthSession);
const mockData = jest.mocked(getDownloadAnalyticsData);

function emptyData(): DownloadAnalyticsDashboardData {
  return {
    summary: {
      totalGitHubDownloads: 0,
      totalWebsiteDownloads: 0,
      channelDownloads: { stable: 0, beta: 0, alpha: 0 },
      lastSyncedAt: null,
      syncStatus: 'NEVER',
      lastSyncError: null,
    },
    dailyHistory: [],
    assets: [],
    countries: [],
  };
}

async function renderPage(): Promise<string> {
  const page = await DownloadAnalyticsPage({
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(page);
}

beforeEach(() => {
  mockSession.mockResolvedValue({
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      sessionId: 'session-1',
      emailVerified: null,
    },
    session: { id: 'session-1', expiresAt: {} as never },
  });
  mockData.mockReset();
});

it('renders GitHub and website downloads separately', async () => {
  mockData.mockResolvedValue({
    ...emptyData(),
    summary: {
      ...emptyData().summary,
      totalGitHubDownloads: 1234,
      totalWebsiteDownloads: 56,
      syncStatus: 'SUCCESS',
      lastSyncedAt: '2026-11-14T10:00:00.000Z',
    },
    dailyHistory: [
      { date: '2026-11-14', gitHubDifference: 10, websiteDownloads: 5 },
    ],
  });

  const html = await renderPage();

  expect(html).toContain('GitHub Downloads gesamt');
  expect(html).toContain('Website-Aufrufe gesamt');
  expect(html).toContain('1.234');
  expect(html).toContain('56');
  expect(html).toContain('Stabil');
});

it('shows empty states instead of crashing when there is no data', async () => {
  mockData.mockResolvedValue(emptyData());

  const html = await renderPage();

  expect(html).toContain('Noch keine Release-Assets synchronisiert');
  expect(html).toContain('Bisher keine Website-Downloads mit Länderinformationen erfasst');
  expect(html).not.toContain('NaN');
});

it('renders a controlled error state when the database query fails', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockData.mockRejectedValue(new Error('relation "GitHubReleaseAsset" does not exist'));

  const html = await renderPage();

  expect(html).toContain('Statistiken nicht verfügbar');
  expect(html).toContain('Erneut versuchen');
  expect(html).toContain('keine Ersatzzahlen');
  expect(html).not.toContain('GitHub Downloads gesamt');
});
