/**
 * @jest-environment node
 *
 * Server-side authorization tests.
 *
 * The NextAuth session is mocked, but the DB session lookup is controlled per
 * test to prove that:
 *   - a missing/revoked/expired database session is treated as unauthenticated,
 *   - the role used for authorization comes from the database, not from the
 *     JWT claim a client might have obtained before a role change.
 */
import { getServerSession } from 'next-auth';
import { validateDatabaseSessionById } from '../auth-service';
import {
  getServerAuthSession,
  requireAdminSession,
  requireDeveloperSession,
  requireUserSession,
} from '../server-auth';
import { ForbiddenError, UnauthorizedError } from '../auth-service';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

// The helper marks the session read as request-time. Outside a Next request
// scope (plain Jest) `connection()` has nothing to await, so it resolves.
jest.mock('next/server', () => ({
  connection: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../auth', () => ({
  authOptions: {},
}));

jest.mock('../auth-service', () => ({
  ...jest.requireActual('../auth-service'),
  validateDatabaseSessionById: jest.fn(),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockValidate = validateDatabaseSessionById as jest.MockedFunction<
  typeof validateDatabaseSessionById
>;

const dbSession = {
  id: 'session-1',
  expiresAt: Temporal.Now.instant().add({ hours: 1 }),
};

const dbUser = {
  id: 'user-1',
  email: 'user@webradio.local',
  name: 'User One',
  role: 'USER' as const,
  emailVerified: Temporal.Now.instant(),
};

function jwtSession(role: 'USER' | 'DEVELOPER' | 'ADMIN' = 'USER') {
  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role,
      sessionId: dbSession.id,
    },
    expires: Temporal.Now.instant().add({ hours: 1 }).toString(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getServerAuthSession', () => {
  it('returns null without a NextAuth session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(getServerAuthSession()).resolves.toBeNull();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('returns null for a JWT without a linked database session id', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: dbUser.id, email: dbUser.email, role: 'USER' },
      expires: '2099-01-01',
    } as never);

    await expect(getServerAuthSession()).resolves.toBeNull();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('returns null when the database session was revoked', async () => {
    mockGetServerSession.mockResolvedValue(jwtSession() as never);
    mockValidate.mockResolvedValue(null);

    await expect(getServerAuthSession()).resolves.toBeNull();
  });

  it('returns null when the session belongs to a different user', async () => {
    mockGetServerSession.mockResolvedValue(jwtSession() as never);
    mockValidate.mockResolvedValue({
      session: dbSession,
      user: { ...dbUser, id: 'someone-else' },
    });

    await expect(getServerAuthSession()).resolves.toBeNull();
  });

  it('returns the live session with the database user', async () => {
    mockGetServerSession.mockResolvedValue(jwtSession() as never);
    mockValidate.mockResolvedValue({ session: dbSession, user: dbUser });

    const result = await getServerAuthSession();
    expect(result?.user.id).toBe(dbUser.id);
    expect(result?.user.sessionId).toBe(dbSession.id);
    expect(mockValidate).toHaveBeenCalledWith(dbSession.id);
  });
});

describe('Role-gated requirements', () => {
  it('throws UnauthorizedError when there is no live session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(requireUserSession()).rejects.toThrow(UnauthorizedError);
    await expect(requireAdminSession()).rejects.toThrow(UnauthorizedError);
  });

  it('ignores an ADMIN claim in the JWT when the database role is USER', async () => {
    // Client holds a token that claims ADMIN (e.g. issued before a demotion).
    mockGetServerSession.mockResolvedValue(jwtSession('ADMIN') as never);
    mockValidate.mockResolvedValue({ session: dbSession, user: { ...dbUser, role: 'USER' } });

    await expect(requireAdminSession()).rejects.toThrow(ForbiddenError);
    await expect(requireDeveloperSession()).rejects.toThrow(ForbiddenError);
    await expect(requireUserSession()).resolves.toMatchObject({ role: 'USER' });
  });

  it('allows DEVELOPER into the developer area but not the admin area', async () => {
    mockGetServerSession.mockResolvedValue(jwtSession('USER') as never);
    mockValidate.mockResolvedValue({
      session: dbSession,
      user: { ...dbUser, role: 'DEVELOPER' },
    });

    await expect(requireDeveloperSession()).resolves.toMatchObject({ role: 'DEVELOPER' });
    await expect(requireAdminSession()).rejects.toThrow(ForbiddenError);
  });

  it('grants ADMIN access from the database role', async () => {
    mockGetServerSession.mockResolvedValue(jwtSession('USER') as never);
    mockValidate.mockResolvedValue({ session: dbSession, user: { ...dbUser, role: 'ADMIN' } });

    await expect(requireAdminSession()).resolves.toMatchObject({ role: 'ADMIN' });
  });
});
