/**
 * @jest-environment node
 *
 * Page-view beacon: origin check, DNT/GPC, bot filtering and silent failures.
 */
import { NextRequest } from 'next/server';
import { POST } from '../analytics/pageview/route';
import { trackPageView } from '@/lib/analytics/website';
import { enforceIpRateLimit } from '@/lib/rate-limit-http';

jest.mock('@/lib/analytics/website', () => ({
  ...jest.requireActual('@/lib/analytics/website'),
  trackPageView: jest.fn(),
}));

jest.mock('@/lib/rate-limit-http', () => ({
  enforceIpRateLimit: jest.fn(),
}));

const trackMock = trackPageView as jest.MockedFunction<typeof trackPageView>;
const limitMock = enforceIpRateLimit as jest.MockedFunction<typeof enforceIpRateLimit>;

function request(
  body: unknown,
  options: { headers?: Record<string, string>; raw?: string } = {},
): NextRequest {
  return new NextRequest('http://localhost/api/analytics/pageview', {
    method: 'POST',
    headers: {
      host: 'localhost',
      origin: 'http://localhost',
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  trackMock.mockReset();
  trackMock.mockResolvedValue(undefined);
  limitMock.mockReset();
  limitMock.mockResolvedValue(null);
});

describe('POST /api/analytics/pageview', () => {
  it('records a valid view and answers 204', async () => {
    const response = await POST(
      request({ path: '/downloads', referrer: 'https://github.com/x' }),
    );

    expect(response.status).toBe(204);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock.mock.calls[0][0]).toMatchObject({
      path: '/downloads',
      referrer: 'https://github.com/x',
    });
  });

  it('does not count Do Not Track or Global Privacy Control requests', async () => {
    expect((await POST(request({ path: '/' }, { headers: { dnt: '1' } }))).status).toBe(204);
    expect((await POST(request({ path: '/' }, { headers: { 'sec-gpc': '1' } }))).status).toBe(204);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not count bots', async () => {
    const response = await POST(
      request({ path: '/' }, { headers: { 'user-agent': 'Googlebot/2.1' } }),
    );

    expect(response.status).toBe(204);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('rejects a foreign origin with 403', async () => {
    const response = await POST(
      request({ path: '/' }, { headers: { origin: 'https://evil.example' } }),
    );

    expect(response.status).toBe(403);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limit denies the request', async () => {
    limitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 }) as never,
    );

    const response = await POST(request({ path: '/' }));

    expect(response.status).toBe(429);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('ignores invalid bodies and missing paths', async () => {
    expect((await POST(request({}, { raw: 'not-json' }))).status).toBe(204);
    expect((await POST(request({ referrer: 'x' }))).status).toBe(204);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('never fails the request when tracking throws', async () => {
    trackMock.mockRejectedValue(new Error('db down'));

    const response = await POST(request({ path: '/' }));

    expect(response.status).toBe(204);
  });
});
