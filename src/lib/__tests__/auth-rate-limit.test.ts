/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server';

jest.mock('../rate-limit-http', () => ({
  enforceRateLimits: jest.fn(),
  normalizedEmailIdentifier: (email: string) => email.trim().toLowerCase(),
}));

jest.mock('../rate-limit', () => ({
  getClientIp: jest.fn(),
}));

import { guardCredentialsLogin } from '../auth-rate-limit';
import { enforceRateLimits } from '../rate-limit-http';
import { getClientIp } from '../rate-limit';

const mockLimits = jest.mocked(enforceRateLimits);
const mockGetIp = jest.mocked(getClientIp);

function credentialsRequest(body: string): Request {
  return new Request('http://localhost/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLimits.mockResolvedValue(null);
  mockGetIp.mockReturnValue(null);
});

describe('guardCredentialsLogin', () => {
  it('ignores non-credentials NextAuth routes', async () => {
    const request = new Request('http://localhost/api/auth/session');

    await expect(guardCredentialsLogin(request)).resolves.toBeNull();
    expect(mockLimits).not.toHaveBeenCalled();
  });

  it('rate-limits the normalized account even without a trusted proxy IP', async () => {
    await guardCredentialsLogin(credentialsRequest('email=User%40Example.com&password=x'));

    expect(mockLimits).toHaveBeenCalledWith([
      { scope: 'loginAccount', identifier: 'user@example.com' },
    ]);
  });

  it('adds the trusted proxy IP bucket when one is available', async () => {
    mockGetIp.mockReturnValue('203.0.113.7');

    await guardCredentialsLogin(credentialsRequest('email=user%40example.com&password=x'));

    expect(mockLimits).toHaveBeenCalledWith([
      { scope: 'loginIp', identifier: '203.0.113.7' },
      { scope: 'loginAccount', identifier: 'user@example.com' },
    ]);
  });

  it('returns the 429 response produced by the limiter', async () => {
    const limited = NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
    mockLimits.mockResolvedValue(limited);

    const response = await guardCredentialsLogin(
      credentialsRequest('email=user%40example.com&password=x'),
    );

    expect(response?.status).toBe(429);
  });

  it('leaves the original request body available to NextAuth', async () => {
    const request = credentialsRequest('email=user%40example.com&password=secret');
    await guardCredentialsLogin(request);

    await expect(request.text()).resolves.toBe(
      'email=user%40example.com&password=secret',
    );
  });
});
