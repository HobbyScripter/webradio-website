/**
 * @jest-environment node
 */
import { errorResponse, isSameOriginRequest } from '../api-response';

function request(headers: Record<string, string>): Request {
  return new Request('http://127.0.0.1:3000/api/admin/users/role', {
    method: 'POST',
    headers,
  });
}

describe('isSameOriginRequest', () => {
  const originalUrl = process.env['NEXTAUTH_URL'];

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env['NEXTAUTH_URL'];
    } else {
      process.env['NEXTAUTH_URL'] = originalUrl;
    }
  });

  it('allows non-browser requests without an Origin header', () => {
    expect(isSameOriginRequest(request({ host: '127.0.0.1:3000' }))).toBe(true);
  });

  it('allows an Origin that matches the request host', () => {
    expect(
      isSameOriginRequest(
        request({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }),
      ),
    ).toBe(true);
  });

  it('rejects a foreign Origin', () => {
    delete process.env['NEXTAUTH_URL'];
    expect(
      isSameOriginRequest(request({ host: '127.0.0.1:3000', origin: 'https://evil.example' })),
    ).toBe(false);
  });

  it('accepts the configured NEXTAUTH_URL origin behind a proxy', () => {
    process.env['NEXTAUTH_URL'] = 'https://webradio.example';
    expect(
      isSameOriginRequest(
        request({ host: 'internal:3000', origin: 'https://webradio.example' }),
      ),
    ).toBe(true);
  });

  it('rejects an unparsable Origin', () => {
    expect(isSameOriginRequest(request({ host: '127.0.0.1:3000', origin: 'not a url' }))).toBe(
      false,
    );
  });
});

describe('errorResponse', () => {
  it('returns a generic body for internal errors', async () => {
    const response = errorResponse('test', new Error('relation "User" does not exist'));
    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/relation|User/);
  });
});
