/**
 * @jest-environment node
 *
 * Analytics sync endpoint: CRON_SECRET and admin authorization.
 */
import { NextRequest } from 'next/server';
import { GET, POST } from '../admin/analytics/sync/route';
import { getServerAuthSession } from '@/lib/server-auth';
import { runAnalyticsSync } from '@/lib/analytics/sync';

jest.mock('@/lib/analytics/sync', () => ({ runAnalyticsSync: jest.fn() }));
jest.mock('@/lib/server-auth', () => ({ getServerAuthSession: jest.fn() }));

const runMock = runAnalyticsSync as jest.MockedFunction<typeof runAnalyticsSync>;
const sessionMock = getServerAuthSession as jest.MockedFunction<typeof getServerAuthSession>;

const ORIGINAL_SECRET = process.env['CRON_SECRET'];

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/admin/analytics/sync', {
    method: 'GET',
    headers,
  });
}

beforeEach(() => {
  process.env['CRON_SECRET'] = 'cron-secret';
  runMock.mockReset();
  runMock.mockResolvedValue({
    ok: true,
    startedAt: '2026-11-14T03:15:00Z',
    completedAt: '2026-11-14T03:15:02Z',
    durationMs: 2000,
    jobs: [],
    retention: { pageViewsDeleted: 0, downloadRequestsDeleted: 0 },
  });
  sessionMock.mockReset();
  sessionMock.mockResolvedValue(null);
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env['CRON_SECRET'];
  else process.env['CRON_SECRET'] = ORIGINAL_SECRET;
});

describe('/api/admin/analytics/sync', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('accepts the cron bearer token on GET', async () => {
    const response = await GET(request({ authorization: 'Bearer cron-secret' }));

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it('accepts an admin session on POST', async () => {
    sessionMock.mockResolvedValue({
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

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-admin session', async () => {
    sessionMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        role: 'USER',
        sessionId: 'session-1',
        emailVerified: null,
      },
      session: { id: 'session-1', expiresAt: {} as never },
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });
});
