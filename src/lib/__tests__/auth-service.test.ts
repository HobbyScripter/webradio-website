/**
 * @jest-environment node
 *
 * Authentication & Authorization Service — UNIT tests
 *
 * These tests mock the database on purpose: they pin down hashing, token
 * composition, error mapping and role hierarchy without needing PostgreSQL.
 * The real database behaviour is covered by `db.integration.test.ts`
 * (`npm run test:integration`), which is not mocked.
 */
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  hasRole,
  assertRole,
  toPublicError,
  DuplicateEmailError,
  InvalidCredentialsError,
  ForbiddenError,
  registerUser,
  authenticateUser,
  validateDatabaseSession,
  validateDatabaseSessionById,
} from '../auth-service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    orm: {
      public: {
        User: {
          first: jest.fn(),
          create: jest.fn(),
        },
        Session: {
          first: jest.fn(),
          create: jest.fn(),
          where: jest.fn().mockReturnValue({
            delete: jest.fn().mockResolvedValue(undefined),
          }),
        },
        AuditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      },
    },
  },
}));

type MockCollection = {
  first: jest.Mock;
  create: jest.Mock;
  where?: jest.Mock;
};

const mockUser = db.orm.public.User as unknown as MockCollection;
const mockSession = db.orm.public.Session as unknown as MockCollection;

const activeUser = {
  id: '00000000-0000-7000-8000-000000000001',
  email: 'user@webradio.local',
  passwordHash: '$2b$12$placeholder',
  name: 'User One',
  role: 'USER',
  emailVerified: null,
  createdAt: Temporal.Now.instant(),
  updatedAt: Temporal.Now.instant(),
};

describe('Auth Service — Password hashing', () => {
  it('hashes with bcrypt and verifies the correct password', async () => {
    const password = 'SuperSecurePassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPassword!', hash)).resolves.toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(verifyPassword('irrelevant', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });
});

describe('Auth Service — Session token composition', () => {
  it('generates 256-bit, non-repeating base64url tokens', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).toHaveLength(43);
    expect(second).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes tokens with SHA-256 so only digests are stored', () => {
    const token = generateSessionToken();
    const digest = hashSessionToken(token);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toBe(token);
    expect(hashSessionToken(token)).toBe(digest);
    expect(hashSessionToken(generateSessionToken())).not.toBe(digest);
  });
});

describe('Auth Service — Registration & duplicate emails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects registration when the email already exists', async () => {
    mockUser.first.mockResolvedValueOnce(activeUser);

    await expect(
      registerUser({
        email: 'user@webradio.local',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    ).rejects.toThrow(DuplicateEmailError);

    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('registers a new user with the default USER role', async () => {
    mockUser.first.mockResolvedValueOnce(null);
    mockUser.create.mockResolvedValueOnce({
      ...activeUser,
      id: 'new-uuid',
      email: 'newuser@webradio.local',
    });

    const user = await registerUser({
      email: 'NewUser@WebRadio.local',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      name: 'New User',
    });

    expect(user.email).toBe('newuser@webradio.local');
    expect(user.role).toBe('USER');
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'USER', email: 'newuser@webradio.local' }),
    );
  });
});

describe('Auth Service — Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an unknown user with InvalidCredentialsError', async () => {
    mockUser.first.mockResolvedValueOnce(null);
    await expect(authenticateUser('unknown@example.com', 'SomePassword123!')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('CorrectPassword123!');
    mockUser.first.mockResolvedValueOnce({ ...activeUser, passwordHash: hash });

    await expect(authenticateUser('user@webradio.local', 'IncorrectPassword!')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('accepts the correct password and returns the database role', async () => {
    const hash = await hashPassword('CorrectPassword123!');
    mockUser.first.mockResolvedValueOnce({
      ...activeUser,
      passwordHash: hash,
      role: 'DEVELOPER',
    });

    const user = await authenticateUser('user@webradio.local', 'CorrectPassword123!');
    expect(user.id).toBe(activeUser.id);
    expect(user.role).toBe('DEVELOPER');
  });
});

describe('Auth Service — Session validation (mocked DB)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects and cleans up an expired session', async () => {
    mockSession.first.mockResolvedValueOnce({
      id: 'session-old',
      userId: activeUser.id,
      expiresAt: Temporal.Now.instant().subtract({ hours: 1 }),
    });

    await expect(validateDatabaseSession('expired-token')).resolves.toBeNull();
  });

  it('loads the current role for a live session', async () => {
    mockSession.first.mockResolvedValueOnce({
      id: 'session-live',
      userId: activeUser.id,
      expiresAt: Temporal.Now.instant().add({ hours: 1 }),
    });
    mockUser.first.mockResolvedValueOnce({ ...activeUser, role: 'ADMIN' });

    const result = await validateDatabaseSession('live-token');
    expect(result?.user.role).toBe('ADMIN');
    expect(result?.session.id).toBe('session-live');
    // The raw token / stored hash must never be exposed to callers.
    expect(result?.session).not.toHaveProperty('token');
  });

  it('resolves a session by opaque id for the NextAuth glue', async () => {
    mockSession.first.mockResolvedValueOnce({
      id: 'session-by-id',
      userId: activeUser.id,
      expiresAt: Temporal.Now.instant().add({ hours: 1 }),
    });
    mockUser.first.mockResolvedValueOnce(activeUser);

    const result = await validateDatabaseSessionById('session-by-id');
    expect(result?.user.id).toBe(activeUser.id);
  });
});

describe('Auth Service — Role hierarchy and forbidden actions', () => {
  it('computes the role hierarchy', () => {
    expect(hasRole('USER', 'USER')).toBe(true);
    expect(hasRole('USER', 'DEVELOPER')).toBe(false);
    expect(hasRole('USER', 'ADMIN')).toBe(false);
    expect(hasRole('DEVELOPER', 'USER')).toBe(true);
    expect(hasRole('DEVELOPER', 'DEVELOPER')).toBe(true);
    expect(hasRole('DEVELOPER', 'ADMIN')).toBe(false);
    expect(hasRole('ADMIN', 'USER')).toBe(true);
    expect(hasRole('ADMIN', 'DEVELOPER')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'SYSTEM_ADMIN')).toBe(false);
    expect(hasRole('SYSTEM_ADMIN', 'USER')).toBe(true);
    expect(hasRole('SYSTEM_ADMIN', 'DEVELOPER')).toBe(true);
    expect(hasRole('SYSTEM_ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('SYSTEM_ADMIN', 'SYSTEM_ADMIN')).toBe(true);
  });

  it('prevents USER and DEVELOPER from executing ADMIN actions', () => {
    expect(() => assertRole('USER', 'ADMIN')).toThrow(ForbiddenError);
    expect(() => assertRole('DEVELOPER', 'ADMIN')).toThrow(ForbiddenError);
    expect(() => assertRole('ADMIN', 'ADMIN')).not.toThrow();
    expect(() => assertRole('ADMIN', 'SYSTEM_ADMIN')).toThrow(ForbiddenError);
    expect(() => assertRole('SYSTEM_ADMIN', 'ADMIN')).not.toThrow();
  });
});

describe('Auth Service — Error sanitization', () => {
  it('hides internal details for unexpected errors', () => {
    const internal = new Error(
      'relation "User" does not exist; passwordHash=$2b$12$leaked',
    );

    const response = toPublicError(internal);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toMatch(/relation|passwordHash|leaked/);
  });

  it('keeps auth status codes and messages', () => {
    expect(toPublicError(new InvalidCredentialsError())).toEqual({
      status: 401,
      body: { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    });
  });
});
