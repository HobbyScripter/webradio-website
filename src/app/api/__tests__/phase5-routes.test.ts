/**
 * @jest-environment node
 *
 * Route-level authorization tests for the Phase 5 developer and admin APIs.
 * Services are mocked; the real PostgreSQL authorization is covered by
 * `phase5.integration.test.ts`.
 */
import { NextResponse } from 'next/server';

jest.mock('@/lib/auth-service', () => {
  class AuthError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, statusCode = 400, code = 'AUTH_ERROR') {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return {
    AuthError,
    UnauthorizedError: class UnauthorizedError extends AuthError {
      constructor(message = 'Authentication required.') {
        super(message, 401, 'UNAUTHORIZED');
      }
    },
    ForbiddenError: class ForbiddenError extends AuthError {
      constructor(message = 'Insufficient permissions.') {
        super(message, 403, 'FORBIDDEN');
      }
    },
    NotFoundError: class NotFoundError extends AuthError {
      constructor(message = 'Not found.') {
        super(message, 404, 'NOT_FOUND');
      }
    },
    DuplicateEmailError: class DuplicateEmailError extends AuthError {},
    logServerError: jest.fn(),
    toPublicError: (error: unknown) => {
      if (error instanceof AuthError) {
        return {
          status: error.statusCode,
          body: { error: error.code, message: error.message },
        };
      }
      return {
        status: 500,
        body: { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      };
    },
  };
});

jest.mock('@/lib/rate-limit-http', () => ({
  enforceRateLimits: jest.fn(),
}));

jest.mock('@/lib/server-auth', () => ({
  requireDeveloperSession: jest.fn(),
  requireAdminSession: jest.fn(),
}));

jest.mock('@/lib/developer-catalog-service', () => ({
  listOwnedEntries: jest.fn(),
  getOwnedEntry: jest.fn(),
  createCatalogEntry: jest.fn(),
  updateCatalogEntry: jest.fn(),
  deleteCatalogEntry: jest.fn(),
  addCatalogVersion: jest.fn(),
  submitCatalogEntry: jest.fn(),
  withdrawCatalogEntry: jest.fn(),
  decideCatalogEntry: jest.fn(),
}));

jest.mock('@/lib/news-service', () => ({
  listAdminNews: jest.fn(),
  createNews: jest.fn(),
  updateNews: jest.fn(),
  setNewsPublished: jest.fn(),
  deleteNews: jest.fn(),
  getAdminNewsById: jest.fn(),
}));

import { GET as listThemes, POST as createTheme } from '@/app/api/developer/themes/route';
import {
  GET as getTheme,
  PUT as updateTheme,
  DELETE as deleteTheme,
} from '@/app/api/developer/themes/[id]/route';
import { POST as createVersion } from '@/app/api/developer/themes/[id]/versions/route';
import {
  POST as submitTheme,
  DELETE as withdrawTheme,
} from '@/app/api/developer/themes/[id]/submit/route';
import { POST as decide } from '@/app/api/admin/moderation/decision/route';
import { GET as listNews, POST as createNews } from '@/app/api/admin/news/route';
import { PATCH as publishNews } from '@/app/api/admin/news/[id]/route';
import { requireAdminSession, requireDeveloperSession } from '@/lib/server-auth';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import {
  createCatalogEntry,
  decideCatalogEntry,
  getOwnedEntry,
  listOwnedEntries,
  submitCatalogEntry,
  updateCatalogEntry,
  withdrawCatalogEntry,
} from '@/lib/developer-catalog-service';
import { createNews as createNewsService, listAdminNews, setNewsPublished } from '@/lib/news-service';

const mockDeveloperSession = jest.mocked(requireDeveloperSession);
const mockAdminSession = jest.mocked(requireAdminSession);
const mockLimits = jest.mocked(enforceRateLimits);
const mockListOwned = jest.mocked(listOwnedEntries);
const mockGetOwned = jest.mocked(getOwnedEntry);
const mockCreate = jest.mocked(createCatalogEntry);
const mockUpdate = jest.mocked(updateCatalogEntry);
const mockSubmit = jest.mocked(submitCatalogEntry);
const mockWithdraw = jest.mocked(withdrawCatalogEntry);
const mockDecide = jest.mocked(decideCatalogEntry);
const mockCreateNews = jest.mocked(createNewsService);
const mockListAdminNews = jest.mocked(listAdminNews);
const mockSetNewsPublished = jest.mocked(setNewsPublished);

const DEVELOPER = {
  id: 'developer-1',
  email: 'dev@webradio.test',
  name: 'Dev',
  role: 'DEVELOPER' as const,
  sessionId: 'session-dev',
  emailVerified: null,
};

const ADMIN = {
  id: 'admin-1',
  email: 'admin@webradio.test',
  name: 'Admin',
  role: 'ADMIN' as const,
  sessionId: 'session-admin',
  emailVerified: null,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(path: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', host: 'localhost' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLimits.mockResolvedValue(null);
  mockDeveloperSession.mockResolvedValue(DEVELOPER);
  mockAdminSession.mockResolvedValue(ADMIN);
});

describe('developer API authorization', () => {
  it('returns 401 without a valid developer session and touches no data', async () => {
    const { UnauthorizedError } = jest.requireMock('@/lib/auth-service');
    mockDeveloperSession.mockRejectedValue(new UnauthorizedError());

    const response = await listThemes();

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockListOwned).not.toHaveBeenCalled();
  });

  it('derives the owner from the session, never from query parameters', async () => {
    mockListOwned.mockResolvedValue([]);

    await listThemes();

    expect(mockListOwned).toHaveBeenCalledWith('developer-1', 'THEME');
  });

  it('rejects a cross-origin mutation before authorization or writes', async () => {
    const response = await createTheme(
      new Request('http://localhost/api/developer/themes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ name: 'Evil', slug: 'evil' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockDeveloperSession).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('applies the per-account write limit before the service runs', async () => {
    mockLimits.mockResolvedValue(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }),
    );

    const response = await createTheme(
      jsonRequest('/api/developer/themes', 'POST', { name: 'Rate', slug: 'rate' }),
    );

    expect(response.status).toBe(429);
    expect(mockLimits).toHaveBeenCalledWith([
      { scope: 'contentWrite', identifier: 'developer-1' },
    ]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('ignores a forged actor in the body and uses the session user', async () => {
    mockCreate.mockResolvedValue({ id: 'theme-1' } as never);

    const response = await createTheme(
      jsonRequest('/api/developer/themes', 'POST', {
        actorId: 'someone-else',
        name: 'Theme',
        slug: 'theme',
        description: 'Beschreibung',
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'developer-1',
        kind: 'THEME',
        raw: expect.objectContaining({ actorId: 'someone-else' }),
      }),
    );
  });

  it('rejects invalid JSON without calling the service', async () => {
    const response = await createTheme(
      new Request('http://localhost/api/developer/themes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'localhost' },
        body: 'not json',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('passes the route id and session actor to the ownership-checked service', async () => {
    mockGetOwned.mockResolvedValue({ id: 'theme-9' } as never);
    mockUpdate.mockResolvedValue({ id: 'theme-9' } as never);
    mockSubmit.mockResolvedValue({ id: 'theme-9', status: 'PENDING_REVIEW' } as never);
    mockWithdraw.mockResolvedValue({ id: 'theme-9', status: 'DRAFT' } as never);

    const read = await getTheme(jsonRequest('/api/developer/themes/theme-9', 'GET', undefined), params('theme-9'));
    const updated = await updateTheme(
      jsonRequest('/api/developer/themes/theme-9', 'PUT', { name: 'Neu' }),
      params('theme-9'),
    );
    const submitted = await submitTheme(
      jsonRequest('/api/developer/themes/theme-9/submit', 'POST', undefined),
      params('theme-9'),
    );
    const withdrawn = await withdrawTheme(
      jsonRequest('/api/developer/themes/theme-9/submit', 'DELETE', undefined),
      params('theme-9'),
    );

    expect(read.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(submitted.status).toBe(200);
    expect(withdrawn.status).toBe(200);

    expect(mockGetOwned).toHaveBeenCalledWith('developer-1', 'THEME', 'theme-9');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'developer-1', entryId: 'theme-9', kind: 'THEME' }),
    );
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'developer-1', entryId: 'theme-9' }),
    );
    expect(mockWithdraw).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'developer-1', entryId: 'theme-9' }),
    );
  });

  it('returns 404 without leaking another developer’s entry', async () => {
    const { NotFoundError } = jest.requireMock('@/lib/auth-service');
    mockGetOwned.mockRejectedValue(new NotFoundError('Plugin nicht gefunden.'));

    const response = await getTheme(
      jsonRequest('/api/developer/themes/foreign', 'GET', undefined),
      params('foreign'),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toMatch(/owner|developerId/);
  });

  it('deletes only through the ownership-checked service', async () => {
    const { deleteCatalogEntry } = jest.requireMock('@/lib/developer-catalog-service');
    (deleteCatalogEntry as jest.Mock).mockResolvedValue(undefined);

    const response = await deleteTheme(
      jsonRequest('/api/developer/themes/theme-9', 'DELETE', undefined),
      params('theme-9'),
    );

    expect(response.status).toBe(200);
    expect(deleteCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'developer-1', entryId: 'theme-9' }),
    );
  });

  it('creates versions with the session actor', async () => {
    const { addCatalogVersion } = jest.requireMock('@/lib/developer-catalog-service');
    (addCatalogVersion as jest.Mock).mockResolvedValue({ id: 'version-1' });

    const response = await createVersion(
      jsonRequest('/api/developer/themes/theme-9/versions', 'POST', {
        version: '1.1.0',
        fileUrl: 'https://example.com/theme.zip',
      }),
      params('theme-9'),
    );

    expect(response.status).toBe(201);
    expect(addCatalogVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'developer-1',
        entryId: 'theme-9',
        kind: 'THEME',
      }),
    );
  });
});

describe('admin moderation API', () => {
  it('rejects a cross-origin decision before authorization', async () => {
    const response = await decide(
      new Request('http://localhost/api/admin/moderation/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({
          targetType: 'PLUGIN',
          targetId: 'plugin-1',
          decision: 'APPROVED',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockAdminSession).not.toHaveBeenCalled();
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('requires a reason for a rejection before calling the service', async () => {
    const response = await decide(
      jsonRequest('/api/admin/moderation/decision', 'POST', {
        targetType: 'PLUGIN',
        targetId: 'plugin-1',
        decision: 'REJECTED',
        notes: 'zu kurz',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('records a valid approval with the admin from the session', async () => {
    mockDecide.mockResolvedValue({ status: 'APPROVED' } as never);

    const response = await decide(
      jsonRequest('/api/admin/moderation/decision', 'POST', {
        targetType: 'PLUGIN',
        targetId: 'plugin-1',
        decision: 'APPROVED',
        actorId: 'forged',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockDecide).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        kind: 'PLUGIN',
        entryId: 'plugin-1',
        decision: 'APPROVED',
      }),
    );
    expect(mockAdminSession).toHaveBeenCalled();
  });

  it('returns 403 when the admin session resolves a lower role', async () => {
    const { ForbiddenError } = jest.requireMock('@/lib/auth-service');
    mockAdminSession.mockRejectedValue(new ForbiddenError());

    const response = await decide(
      jsonRequest('/api/admin/moderation/decision', 'POST', {
        targetType: 'THEME',
        targetId: 'theme-1',
        decision: 'CHANGES_REQUESTED',
        notes: 'Bitte Beschreibung ergänzen.',
      }),
    );

    expect(response.status).toBe(403);
    expect(mockDecide).not.toHaveBeenCalled();
  });
});

describe('admin news API', () => {
  it('keeps drafts out of reach for non-admin sessions', async () => {
    const { ForbiddenError } = jest.requireMock('@/lib/auth-service');
    mockAdminSession.mockRejectedValue(new ForbiddenError());

    const response = await listNews(
      new Request('http://localhost/api/admin/news?status=all', {
        headers: { host: 'localhost' },
      }),
    );

    expect(response.status).toBe(403);
    expect(mockListAdminNews).not.toHaveBeenCalled();
  });

  it('creates news with the session actor and ignores a client-supplied publish flag', async () => {
    mockCreateNews.mockResolvedValue({ id: 'news-1', isPublished: false } as never);

    const response = await createNews(
      jsonRequest('/api/admin/news', 'POST', {
        title: 'Neue Nachricht',
        summary: 'Zusammenfassung',
        content: 'Inhalt',
        isPublished: true,
        actorId: 'forged',
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateNews).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1' }),
    );
  });

  it('validates the publish flag and uses the actor from the session', async () => {
    mockSetNewsPublished.mockResolvedValue({ id: 'news-1', isPublished: false } as never);

    const invalid = await publishNews(
      jsonRequest('/api/admin/news/news-1', 'PATCH', { published: 'yes' }),
      params('news-1'),
    );
    expect(invalid.status).toBe(400);
    expect(mockSetNewsPublished).not.toHaveBeenCalled();

    const valid = await publishNews(
      jsonRequest('/api/admin/news/news-1', 'PATCH', { published: false }),
      params('news-1'),
    );
    expect(valid.status).toBe(200);
    expect(mockSetNewsPublished).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', newsId: 'news-1', published: false }),
    );
  });
});
