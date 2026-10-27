/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server';

jest.mock('@/lib/rate-limit-http', () => ({
  enforceRateLimits: jest.fn(),
}));

jest.mock('@/lib/server-auth', () => ({
  requireAdminSession: jest.fn(),
}));

jest.mock('@/lib/account-suspension', () => ({
  verifyUserEmailManually: jest.fn(),
}));

import { POST as verifyById } from '@/app/api/admin/users/[id]/verify-email/route';
import { POST as verifyByBody } from '@/app/api/admin/users/verify-email/route';
import { requireAdminSession } from '@/lib/server-auth';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import { verifyUserEmailManually } from '@/lib/account-suspension';

const mockRequireAdmin = jest.mocked(requireAdminSession);
const mockLimits = jest.mocked(enforceRateLimits);
const mockVerify = jest.mocked(verifyUserEmailManually);

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLimits.mockResolvedValue(null);
  mockRequireAdmin.mockResolvedValue({
    id: 'admin-id',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'ADMIN',
    sessionId: 'session-id',
    emailVerified: Temporal.Now.instant(),
  });
  mockVerify.mockResolvedValue({
    id: 'user-id',
    email: 'user@example.com',
    emailVerified: Temporal.Now.instant(),
    alreadyVerified: false,
  });
});

describe('POST /api/admin/users/[id]/verify-email', () => {
  it('rejects cross-origin requests', async () => {
    const req = new Request('http://localhost/api/admin/users/user-id/verify-email', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    const res = await verifyById(req, { params: Promise.resolve({ id: 'user-id' }) });
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    mockLimits.mockResolvedValue(NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }));
    const res = await verifyById(jsonRequest('/api/admin/users/user-id/verify-email', {}), {
      params: Promise.resolve({ id: 'user-id' }),
    });
    expect(res.status).toBe(429);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('calls the service with the route id', async () => {
    const res = await verifyById(jsonRequest('/api/admin/users/user-id/verify-email', {}), {
      params: Promise.resolve({ id: 'user-id' }),
    });
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-id', targetUserId: 'user-id' }),
    );
  });
});

describe('POST /api/admin/users/verify-email', () => {
  it('validates the body', async () => {
    const res = await verifyByBody(jsonRequest('/api/admin/users/verify-email', {}));
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('calls the service with userId from body', async () => {
    const res = await verifyByBody(jsonRequest('/api/admin/users/verify-email', { userId: 'user-id' }));
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-id', targetUserId: 'user-id' }),
    );
  });
});