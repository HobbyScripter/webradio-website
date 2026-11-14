/**
 * @jest-environment node
 *
 * Route-level tests for the GitHub webhook endpoint.
 *
 * The database is mocked: these tests pin down signature verification, the
 * repository scope, idempotency and the handler decisions. The real HMAC helper
 * and the real replay claim logic run; only the SQL layer is replaced.
 */
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '../webhooks/github/route';
import * as dbModule from '@/lib/db';
import { syncGitHubDownloadStats } from '@/lib/download-analytics-service';

jest.mock('@/lib/download-analytics-service', () => ({
  syncGitHubDownloadStats: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/lib/db', () => {
  const deliveryFirst = jest.fn();
  const deliveryCreate = jest.fn(async (data: Record<string, unknown>) => data);
  const installationUpdate = jest.fn(async () => ({}));
  const installationFirst = jest.fn(async () => null);
  const installationCreate = jest.fn(async (data: Record<string, unknown>) => data);
  const installationWhere = jest.fn(() => ({ update: installationUpdate }));

  return {
    __dbMocks: {
      deliveryFirst,
      deliveryCreate,
      installationUpdate,
      installationFirst,
      installationCreate,
      installationWhere,
    },
    db: {
      orm: {
        public: {
          GitHubWebhookDelivery: { first: deliveryFirst, create: deliveryCreate },
          GitHubAppInstallation: {
            where: installationWhere,
            first: installationFirst,
            create: installationCreate,
          },
        },
      },
    },
  };
});

const dbMocks = (dbModule as unknown as { __dbMocks: Record<string, jest.Mock> })
  .__dbMocks;
const syncMock = syncGitHubDownloadStats as unknown as jest.Mock;

const SECRET = 'test-webhook-secret';
const originalSecret = process.env['GITHUB_WEBHOOK_SECRET'];

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function request(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('https://webradio.example.com/api/webhooks/github', {
    method: 'POST',
    headers,
    body,
  });
}

function signedRequest(
  body: string,
  headers: Record<string, string> = {},
  event = 'ping',
): NextRequest {
  return request(body, {
    'content-type': 'application/json',
    'x-hub-signature-256': sign(body),
    'x-github-delivery': 'delivery-0001',
    'x-github-event': event,
    ...headers,
  });
}

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'published',
    installation: { id: 182034460, app_slug: 'webradio', account: { login: 'YourEliteSystems' } },
    repository: { full_name: 'YourEliteSystems/WebRadio' },
    release: { id: 1 },
    ...overrides,
  });
}

beforeEach(() => {
  process.env['GITHUB_WEBHOOK_SECRET'] = SECRET;
  for (const mock of Object.values(dbMocks)) {
    mock.mockReset();
  }
  dbMocks.installationWhere!.mockImplementation(() => ({
    update: dbMocks.installationUpdate,
  }));
  dbMocks.deliveryFirst!.mockResolvedValue(null);
  dbMocks.installationFirst!.mockResolvedValue(null);
  syncMock.mockClear();
});

afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env['GITHUB_WEBHOOK_SECRET'];
  } else {
    process.env['GITHUB_WEBHOOK_SECRET'] = originalSecret;
  }
});

describe('POST /api/webhooks/github', () => {
  it('answers 503 when no webhook secret is configured', async () => {
    delete process.env['GITHUB_WEBHOOK_SECRET'];

    const response = await POST(signedRequest(payload()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'WEBHOOK_NOT_CONFIGURED' });
    expect(dbMocks.deliveryFirst).not.toHaveBeenCalled();
  });

  it('rejects an invalid HMAC signature with 401 and records nothing', async () => {
    const body = payload();

    const response = await POST(
      request(body, {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=' + 'a'.repeat(64),
        'x-github-delivery': 'delivery-0001',
        'x-github-event': 'release',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'INVALID_SIGNATURE' });
    expect(dbMocks.deliveryFirst).not.toHaveBeenCalled();
    expect(dbMocks.deliveryCreate).not.toHaveBeenCalled();
  });

  it('requires the delivery id for replay protection', async () => {
    const body = payload();

    const response = await POST(
      request(body, {
        'content-type': 'application/json',
        'x-hub-signature-256': sign(body),
        'x-github-event': 'release',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'MISSING_DELIVERY_ID' });
  });

  it('rejects events for a different repository', async () => {
    const body = payload({ repository: { full_name: 'SomeoneElse/OtherApp' } });

    const response = await POST(signedRequest(body, {}, 'release'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'REPOSITORY_MISMATCH' });
    expect(dbMocks.deliveryFirst).not.toHaveBeenCalled();
  });

  it('does not process a delivery twice', async () => {
    dbMocks.deliveryFirst!.mockResolvedValue({ deliveryId: 'delivery-0001' });

    const response = await POST(signedRequest(payload(), {}, 'release'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, duplicate: true });
    expect(dbMocks.deliveryCreate).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('stores a valid delivery and creates the installation on installation.created', async () => {
    const response = await POST(signedRequest(payload({ action: 'created' }), {}, 'installation'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, handled: 'installation' });
    expect(dbMocks.deliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'delivery-0001',
        event: 'installation',
        action: 'created',
        repository: 'YourEliteSystems/WebRadio',
      }),
    );
    expect(dbMocks.installationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: BigInt(182034460),
        status: 'CONNECTED',
        repositoryName: 'YourEliteSystems/WebRadio',
      }),
    );
    expect(dbMocks.installationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastWebhookAt: expect.anything() }),
    );
  });

  it('triggers the download sync for a published release', async () => {
    const response = await POST(signedRequest(payload(), {}, 'release'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, handled: 'release' });
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('handles installation_repositories events without a sync', async () => {
    const response = await POST(
      signedRequest(payload({ action: 'added' }), {}, 'installation_repositories'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, handled: 'installation' });
    expect(syncMock).not.toHaveBeenCalled();
  });
});
