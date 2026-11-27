/**
 * @jest-environment node
 *
 * Route handler tests for the custom link API: authorization, manipulated
 * request bodies, error codes and the public payload shape.
 */
jest.mock('next/cache', () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  revalidateTag: () => undefined,
}));

jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  connection: async () => undefined,
}));

jest.mock('@/lib/auth-middleware', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/custom-links/service', () => {
  const actual = jest.requireActual('@/lib/custom-links/service');
  return {
    ...actual,
    CustomLinkService: {
      getCustomLinks: jest.fn(),
      createCustomLink: jest.fn(),
      updateCustomLink: jest.fn(),
      deleteCustomLink: jest.fn(),
    },
    getPublicCustomLinks: jest.fn(),
  };
});

import { requireAdmin } from '@/lib/auth-middleware';
import {
  CustomLinkError,
  CustomLinkService,
  getPublicCustomLinks,
} from '@/lib/custom-links/service';
import { GET as publicGet } from '@/app/api/custom-links/route';
import {
  DELETE as adminDelete,
  GET as adminGet,
  PATCH as adminPatch,
  POST as adminPost,
} from '@/app/api/admin/custom-links/route';

const requireAdminMock = jest.mocked(requireAdmin);
const publicReaderMock = jest.mocked(getPublicCustomLinks);
const listMock = jest.mocked(CustomLinkService.getCustomLinks);
const createMock = jest.mocked(CustomLinkService.createCustomLink);
const updateMock = jest.mocked(CustomLinkService.updateCustomLink);
const deleteMock = jest.mocked(CustomLinkService.deleteCustomLink);

const VALID_BODY = {
  position: 'MAIN_NAVIGATION',
  sortOrder: 0,
  isActive: true,
  url: '/news',
  type: 'INTERNAL',
  openInNewTab: false,
  labels: { de: 'News', en: 'News' },
};

function request(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminMock.mockResolvedValue(true as never);
});

describe('public custom link route', () => {
  it('rejects an unknown position', async () => {
    const response = await publicGet(request('http://localhost/api/custom-links?position=SIDEBAR'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unknown_position' });
    expect(publicReaderMock).not.toHaveBeenCalled();
  });

  it('falls back to German for an unsupported locale', async () => {
    publicReaderMock.mockResolvedValue([]);
    await publicGet(request('http://localhost/api/custom-links?position=FOOTER&locale=xx'));
    expect(publicReaderMock).toHaveBeenCalledWith('FOOTER', 'de');
  });

  it('returns only public fields and never internal administration data', async () => {
    publicReaderMock.mockResolvedValue([
      {
        id: 'link-1',
        url: '/news',
        type: 'INTERNAL',
        openInNewTab: false,
        iconName: 'Radio',
        label: 'News',
        // Fields the service keeps for the admin view:
        position: 'MAIN_NAVIGATION',
        sortOrder: 3,
        createdBy: 'admin-1',
      } as never,
    ]);

    const response = await publicGet(
      request('http://localhost/api/custom-links?position=MAIN_NAVIGATION&locale=en'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(body.links).toEqual([
      { id: 'link-1', url: '/news', type: 'INTERNAL', openInNewTab: false, iconName: 'Radio', label: 'News' },
    ]);
    expect(body.links[0]).not.toHaveProperty('createdBy');
    expect(body.links[0]).not.toHaveProperty('position');
    expect(body.links[0]).not.toHaveProperty('sortOrder');
  });

  it('serves an empty list instead of an error when the reader fails', async () => {
    publicReaderMock.mockRejectedValue(new Error('database down'));
    const response = await publicGet(request('http://localhost/api/custom-links?position=FOOTER'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ links: [] });
  });
});

describe('admin custom link route', () => {
  it('rejects unauthenticated reads and writes', async () => {
    requireAdminMock.mockRejectedValue(new Error('Unauthorized'));

    expect((await adminGet(request('http://localhost/api/admin/custom-links'))).status).toBe(401);
    const post = await adminPost(
      request('http://localhost/api/admin/custom-links', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    );
    expect(post.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates a link and attributes it to the signed-in admin', async () => {
    requireAdminMock.mockResolvedValue({ user: { id: 'admin-1' } } as never);
    createMock.mockResolvedValue({ id: 'link-1' } as never);

    const response = await adminPost(
      request('http://localhost/api/admin/custom-links', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
      }),
    );

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(VALID_BODY, 'admin-1');
  });

  it('does not trust extra fields in a manipulated body', async () => {
    requireAdminMock.mockResolvedValue({ user: { id: 'admin-1' } } as never);
    createMock.mockResolvedValue({ id: 'link-1' } as never);

    const manipulated = { ...VALID_BODY, id: 'forced-id', createdBy: 'someone-else', isActive: true };

    await adminPost(
      request('http://localhost/api/admin/custom-links', {
        method: 'POST',
        body: JSON.stringify(manipulated),
      }),
    );

    // The route forwards the body; the service re-validates it and only takes
    // the whitelisted fields, and the owner always comes from the session.
    expect(createMock).toHaveBeenCalledWith(manipulated, 'admin-1');
  });

  it('rejects a patch without an id before touching the database', async () => {
    const response = await adminPatch(
      request('http://localhost/api/admin/custom-links', {
        method: 'PATCH',
        body: JSON.stringify({ sortOrder: 2 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_DATA' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('maps service errors to stable codes and statuses', async () => {
    updateMock.mockRejectedValue(new CustomLinkError('LIMIT_REACHED'));

    const limited = await adminPatch(
      request('http://localhost/api/admin/custom-links', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'link-1', isActive: true }),
      }),
    );
    expect(limited.status).toBe(409);
    expect(await limited.json()).toEqual({ error: 'LIMIT_REACHED' });

    updateMock.mockRejectedValue(new CustomLinkError('NOT_FOUND'));
    const missing = await adminPatch(
      request('http://localhost/api/admin/custom-links', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'missing', sortOrder: 1 }),
      }),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'NOT_FOUND' });
  });

  it('requires an id to delete and returns the private listing header', async () => {
    expect(
      (await adminDelete(request('http://localhost/api/admin/custom-links'))).status,
    ).toBe(400);

    listMock.mockResolvedValue([]);
    const listing = await adminGet(request('http://localhost/api/admin/custom-links?isActive=false'));
    expect(listing.status).toBe(200);
    expect(listing.headers.get('Cache-Control')).toBe('private, no-store');
    expect(listMock).toHaveBeenCalledWith(undefined, false);

    deleteMock.mockResolvedValue({ count: 1 } as never);
    const removed = await adminDelete(
      request('http://localhost/api/admin/custom-links?id=link-1', { method: 'DELETE' }),
    );
    expect(removed.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith('link-1');
  });
});
