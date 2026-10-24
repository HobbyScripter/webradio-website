/**
 * Authentication & Authorization Service Unit Tests
 *
 * Covers:
 *   - Password hashing and verification
 *   - Duplicate email registration detection
 *   - Invalid login credentials handling
 *   - Session generation and expiration checks
 *   - Role-Based Access Control (RBAC) and unauthorized action prevention
 */
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hasRole,
  assertRole,
  DuplicateEmailError,
  InvalidCredentialsError,
  ForbiddenError,
  registerUser,
  authenticateUser,
  validateDatabaseSession,
} from '../auth-service';
import { db } from '../db';

// Mock db.orm.public.* calls for deterministic unit testing without requiring a live Postgres instance
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
            delete: jest.fn().mockResolvedValue(true),
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
  where: jest.Mock;
};

const mockUser = db.orm.public.User as unknown as MockCollection;
const mockSession = db.orm.public.Session as unknown as MockCollection;

describe('Auth Service — Password Hashing', () => {
  it('hashes password with bcrypt and verifies correctly', async () => {
    const password = 'SuperSecurePassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword!', hash);
    expect(isInvalid).toBe(false);
  });
});

describe('Auth Service — Registration & Duplicate Emails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects registration when email already exists', async () => {
    mockUser.first.mockResolvedValueOnce({
      id: 'existing-id',
      email: 'existing@example.com',
      passwordHash: 'somehash',
      name: 'Existing',
      role: 'USER',
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      registerUser({
        email: 'existing@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        name: 'Test User',
      }),
    ).rejects.toThrow(DuplicateEmailError);
  });

  it('successfully registers a new user with unique email', async () => {
    mockUser.first.mockResolvedValueOnce(null); // No user found
    mockUser.create.mockResolvedValueOnce({
      id: 'new-uuid',
      email: 'newuser@example.com',
      passwordHash: 'hashedpwd',
      name: 'New User',
      role: 'USER',
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await registerUser({
      email: 'newuser@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      name: 'New User',
    });

    expect(user.id).toBe('new-uuid');
    expect(user.email).toBe('newuser@example.com');
    expect(user.role).toBe('USER');
    expect(mockUser.create).toHaveBeenCalledTimes(1);
  });
});

describe('Auth Service — Login & Invalid Credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects login for non-existent user', async () => {
    mockUser.first.mockResolvedValueOnce(null);

    await expect(
      authenticateUser('unknown@example.com', 'SomePassword123!'),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects login when password does not match', async () => {
    const realHash = await hashPassword('CorrectPassword123!');

    mockUser.first.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: realHash,
      name: 'User One',
      role: 'USER',
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      authenticateUser('user@example.com', 'IncorrectPassword!'),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('authenticates user when credentials are correct', async () => {
    const realHash = await hashPassword('CorrectPassword123!');

    mockUser.first.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: realHash,
      name: 'User One',
      role: 'DEVELOPER',
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await authenticateUser('user@example.com', 'CorrectPassword123!');
    expect(user.id).toBe('user-1');
    expect(user.role).toBe('DEVELOPER');
  });
});

describe('Auth Service — Session Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a cryptographically strong session token', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(43); // 32 bytes base64url length
    expect(token2).toHaveLength(43);
    expect(token1).not.toBe(token2);
  });

  it('rejects expired database session', async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago

    mockSession.first.mockResolvedValueOnce({
      id: 'session-old',
      userId: 'user-1',
      token: 'expired-token',
      expiresAt: pastDate,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });

    const result = await validateDatabaseSession('expired-token');
    expect(result).toBeNull();
  });

  it('validates active session and loads user role', async () => {
    const futureDate = new Date(Date.now() + 86400 * 1000); // tomorrow

    mockSession.first.mockResolvedValueOnce({
      id: 'session-active',
      userId: 'user-admin',
      token: 'valid-token',
      expiresAt: futureDate,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });

    mockUser.first.mockResolvedValueOnce({
      id: 'user-admin',
      email: 'admin@webradio.local',
      passwordHash: 'hash',
      name: 'Root Admin',
      role: 'ADMIN',
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await validateDatabaseSession('valid-token');
    expect(result).not.toBeNull();
    expect(result?.user.role).toBe('ADMIN');
    expect(result?.user.email).toBe('admin@webradio.local');
  });
});

describe('Auth Service — Role-Based Access Control (RBAC) & Unauthorized Actions', () => {
  it('correctly calculates role hierarchy', () => {
    // USER role
    expect(hasRole('USER', 'USER')).toBe(true);
    expect(hasRole('USER', 'DEVELOPER')).toBe(false);
    expect(hasRole('USER', 'ADMIN')).toBe(false);

    // DEVELOPER role
    expect(hasRole('DEVELOPER', 'USER')).toBe(true);
    expect(hasRole('DEVELOPER', 'DEVELOPER')).toBe(true);
    expect(hasRole('DEVELOPER', 'ADMIN')).toBe(false);

    // ADMIN role
    expect(hasRole('ADMIN', 'USER')).toBe(true);
    expect(hasRole('ADMIN', 'DEVELOPER')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
  });

  it('prevents regular USER from executing ADMIN action', () => {
    expect(() => assertRole('USER', 'ADMIN')).toThrow(ForbiddenError);
  });

  it('prevents DEVELOPER from executing ADMIN action', () => {
    expect(() => assertRole('DEVELOPER', 'ADMIN')).toThrow(ForbiddenError);
  });

  it('allows ADMIN to execute ADMIN and DEVELOPER actions', () => {
    expect(() => assertRole('ADMIN', 'ADMIN')).not.toThrow();
    expect(() => assertRole('ADMIN', 'DEVELOPER')).not.toThrow();
  });
});
