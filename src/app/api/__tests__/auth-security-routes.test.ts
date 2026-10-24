/**
 * @jest-environment node
 *
 * Route-level security tests. The database services are mocked here; the real
 * PostgreSQL behaviour is covered by the integration suite.
 */
import { NextResponse } from 'next/server';

jest.mock('@/lib/rate-limit-http', () => ({
  enforceIpRateLimit: jest.fn(),
  enforceRateLimits: jest.fn(),
  normalizedEmailIdentifier: (email: string) => email.trim().toLowerCase(),
}));

jest.mock('@/lib/account-service', () => ({
  requestPasswordReset: jest.fn(),
  resetPasswordWithToken: jest.fn(),
  requestEmailVerification: jest.fn(),
  verifyEmailWithToken: jest.fn(),
}));

jest.mock('@/lib/server-auth', () => ({
  requireAdminSession: jest.fn(),
}));

jest.mock('@/lib/auth-service', () => ({
  registerUser: jest.fn(),
  changeUserRole: jest.fn(),
  DuplicateEmailError: class DuplicateEmailError extends Error {},
  logServerError: jest.fn(),
  toPublicError: jest.fn(() => ({
    status: 500,
    body: { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  })),
}));

import { POST as registerPost } from '@/app/api/auth/register/route';
import { POST as resetRequestPost } from '@/app/api/auth/password-reset/request/route';
import { POST as resetConfirmPost } from '@/app/api/auth/password-reset/confirm/route';
import { POST as verifyEmailPost } from '@/app/api/auth/verify-email/route';
import { POST as adminRolePost } from '@/app/api/admin/users/role/route';
import { requestPasswordReset, resetPasswordWithToken, requestEmailVerification, verifyEmailWithToken } from '@/lib/account-service';
import { changeUserRole, registerUser } from '@/lib/auth-service';
import { requireAdminSession } from '@/lib/server-auth';
import { enforceIpRateLimit, enforceRateLimits } from '@/lib/rate-limit-http';

const mockIpLimit = jest.mocked(enforceIpRateLimit);
const mockLimits = jest.mocked(enforceRateLimits);
const mockRegister = jest.mocked(registerUser);
const mockChangeUserRole = jest.mocked(changeUserRole);
const mockRequireAdminSession = jest.mocked(requireAdminSession);
const mockResetRequest = jest.mocked(requestPasswordReset);
const mockResetConfirm = jest.mocked(resetPasswordWithToken);
const mockVerificationRequest = jest.mocked(requestEmailVerification);
const mockVerification = jest.mocked(verifyEmailWithToken);

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIpLimit.mockResolvedValue(null);
  mockLimits.mockResolvedValue(null);
  mockRequireAdminSession.mockResolvedValue({
    id: 'admin-id',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'ADMIN',
    sessionId: 'session-id',
    emailVerified: null,
  });
});

describe('POST /api/auth/register', () => {
  it('returns 429 and never touches registration when the IP limit is hit', async () => {
    mockIpLimit.mockResolvedValue(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }),
    );

    const response = await registerPost(
      jsonRequest('/api/auth/register', {
        email: 'user@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    );

    expect(response.status).toBe(429);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('applies the account limit after validation and before registration', async () => {
    mockLimits.mockResolvedValue(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }),
    );

    const response = await registerPost(
      jsonRequest('/api/auth/register', {
        email: 'User@Example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    );

    expect(response.status).toBe(429);
    expect(mockLimits).toHaveBeenCalledWith([
      { scope: 'registerAccount', identifier: 'user@example.com' },
    ]);
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockVerificationRequest).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/password-reset/request', () => {
  it('returns the same generic message for an existing and unknown account', async () => {
    mockResetRequest.mockResolvedValue({
      accountFound: false,
      delivery: { delivered: false, mode: 'unconfigured' },
    });

    const response = await resetRequestPost(
      jsonRequest('/api/auth/password-reset/request', { email: 'unknown@example.com' }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/Wenn ein Konto/);
    expect(JSON.stringify(body)).not.toMatch(/token=|accountFound|unknown/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects an invalid address without calling the account service', async () => {
    const response = await resetRequestPost(
      jsonRequest('/api/auth/password-reset/request', { email: 'not-an-email' }),
    );

    expect(response.status).toBe(400);
    expect(mockResetRequest).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  it('rejects an invalid or already-used token with 400', async () => {
    mockResetConfirm.mockResolvedValue(false);

    const response = await resetConfirmPost(
      jsonRequest('/api/auth/password-reset/confirm', {
        token: 'a'.repeat(43),
        password: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('INVALID_TOKEN');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not echo the token on success', async () => {
    mockResetConfirm.mockResolvedValue(true);
    const token = 'b'.repeat(43);

    const response = await resetConfirmPost(
      jsonRequest('/api/auth/password-reset/confirm', {
        token,
        password: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(token);
  });
});

describe('POST /api/admin/users/role', () => {
  it('never accepts SYSTEM_ADMIN as a requested role', async () => {
    const response = await adminRolePost(
      jsonRequest('/api/admin/users/role', {
        userId: 'target-id',
        role: 'SYSTEM_ADMIN',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockChangeUserRole).not.toHaveBeenCalled();
  });

  it('takes the actor from the verified server session, not the request body', async () => {
    mockChangeUserRole.mockResolvedValue({
      id: 'target-id',
      email: 'target@example.com',
      role: 'DEVELOPER',
      previousRole: 'USER',
    });

    const response = await adminRolePost(
      jsonRequest('/api/admin/users/role', {
        userId: 'target-id',
        role: 'DEVELOPER',
        actorId: 'forged-actor',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockChangeUserRole).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-id', targetUserId: 'target-id' }),
    );
  });

  it('rejects a cross-origin mutation before any authorization or write', async () => {
    const response = await adminRolePost(
      new Request('http://localhost/api/admin/users/role', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
        },
        body: JSON.stringify({ userId: 'target-id', role: 'ADMIN' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockRequireAdminSession).not.toHaveBeenCalled();
    expect(mockChangeUserRole).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/verify-email', () => {
  it('rejects an invalid token', async () => {
    mockVerification.mockResolvedValue(false);

    const response = await verifyEmailPost(
      jsonRequest('/api/auth/verify-email', { token: 'c'.repeat(43) }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_TOKEN');
  });

  it('accepts a valid single-use token', async () => {
    mockVerification.mockResolvedValue(true);

    const response = await verifyEmailPost(
      jsonRequest('/api/auth/verify-email', { token: 'd'.repeat(43) }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).message).toMatch(/bestätigt/);
  });
});
