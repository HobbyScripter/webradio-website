/**
 * @jest-environment node
 *
 * Security tests for analytics admin API endpoints.
 * Tests unauthorized access, CSV injection protection, and input validation.
 */
import { NextRequest } from 'next/server';

// Mock auth so we can control it per-test
const mockGetServerAuthSession = jest.fn();
jest.mock('@/lib/server-auth', () => ({
  getServerAuthSession: () => mockGetServerAuthSession(),
}));

// Mock roles helper
jest.mock('@/lib/roles', () => ({
  hasRole: (role: string, required: string) => {
    const hierarchy = ['USER', 'DEVELOPER', 'ADMIN', 'SYSTEM_ADMIN'];
    return hierarchy.indexOf(role) >= hierarchy.indexOf(required);
  },
}));

// Mock download analytics so POST doesn't actually sync
jest.mock('@/lib/download-analytics-service', () => ({
  syncGitHubDownloadStats: jest.fn().mockResolvedValue({
    success: true,
    syncedAssetsCount: 0,
    totalGitHubDownloads: 0,
    durationMs: 1,
  }),
}));

import { POST as syncPOST } from '@/app/api/admin/downloads/sync/route';

describe('Analytics sync endpoint – authorization', () => {
  beforeEach(() => {
    mockGetServerAuthSession.mockReset();
    // Ensure CRON_SECRET is not set so only session auth is relevant
    delete process.env['CRON_SECRET'];
  });

  it('returns 401 when no session exists and no cron secret', async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/admin/downloads/sync', {
      method: 'POST',
    });
    const res = await syncPOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when user lacks ADMIN role', async () => {
    mockGetServerAuthSession.mockResolvedValue({
      user: { id: 'u1', role: 'USER' },
    });
    const req = new NextRequest('http://localhost/api/admin/downloads/sync', {
      method: 'POST',
    });
    const res = await syncPOST(req);
    expect(res.status).toBe(401);
  });

  it('succeeds for an ADMIN user', async () => {
    mockGetServerAuthSession.mockResolvedValue({
      user: { id: 'u2', role: 'ADMIN' },
    });
    const req = new NextRequest('http://localhost/api/admin/downloads/sync', {
      method: 'POST',
    });
    const res = await syncPOST(req);
    expect(res.status).toBe(200);
  });

  it('allows access via CRON_SECRET bearer token without session', async () => {
    process.env['CRON_SECRET'] = 'test-secret-abc123';
    mockGetServerAuthSession.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/admin/downloads/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret-abc123' },
    });
    const res = await syncPOST(req);
    expect(res.status).toBe(200);
    delete process.env['CRON_SECRET'];
  });
});

// CSV injection prevention (utility function tests)
describe('CSV formula injection prevention', () => {
  function sanitizeCsvCell(value: string): string {
    // Prefix dangerous formula starters with a single quote
    if (/^[=+\-@|]/.test(value)) {
      return `'${value}`;
    }
    return value;
  }

  const dangerousCells: [string, boolean][] = [
    ['=CMD|"/C calc"!A0', true],
    ['+SUM(1+1)', true],
    ['-2+3+cmd', true],
    ['@SUM(1+1)', true],
    ['|data', true],
    ['normal text', false],
    ['1234', false],
    ['stable', false],
  ];

  it.each(dangerousCells)('cell %s is correctly sanitised (dangerous=%s)', (input, isDangerous) => {
    const result = sanitizeCsvCell(input);
    if (isDangerous) {
      expect(result).toMatch(/^'/);
    } else {
      expect(result).toBe(input);
    }
  });
});

// Channel classification boundary tests  
describe('channel value safety', () => {
  it('unknown channel values are normalised safely', () => {
    const knownChannels = new Set(['stable', 'beta', 'alpha', 'rc', 'unknown']);
    const inputs = ['stable', 'rc', '', 'malicious<script>', null, undefined];

    for (const ch of inputs) {
      const normalised = knownChannels.has(ch ?? '') ? (ch ?? 'unknown') : 'unknown';
      expect(knownChannels.has(normalised)).toBe(true);
    }
  });
});
