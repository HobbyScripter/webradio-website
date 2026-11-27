/**
 * @jest-environment node
 *
 * CRON_SECRET bearer authentication: fail closed without a secret, constant-time
 * comparison, and never a secret in a result or log line.
 */
import {
  extractBearerToken,
  readCronSecret,
  timingSafeStringEqual,
  verifyCronRequest,
} from '../cron-auth';

const SECRET = 'unit-test-cron-secret-4f1c';

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/analytics', { method: 'POST', headers });
}

describe('readCronSecret', () => {
  it('returns the trimmed secret and treats blank values as missing', () => {
    expect(readCronSecret({ CRON_SECRET: `  ${SECRET}  ` })).toBe(SECRET);
    expect(readCronSecret({ CRON_SECRET: '   ' })).toBeNull();
    expect(readCronSecret({ CRON_SECRET: '' })).toBeNull();
    expect(readCronSecret({})).toBeNull();
  });
});

describe('extractBearerToken', () => {
  it('accepts the bearer scheme case-insensitively', () => {
    expect(extractBearerToken(request({ authorization: `Bearer ${SECRET}` }).headers)).toBe(SECRET);
    expect(extractBearerToken(request({ authorization: `bearer ${SECRET}` }).headers)).toBe(SECRET);
    expect(extractBearerToken(request({ authorization: `BEARER   ${SECRET}` }).headers)).toBe(
      SECRET,
    );
  });

  it('rejects other schemes, empty tokens and a missing header', () => {
    expect(extractBearerToken(request().headers)).toBeNull();
    expect(extractBearerToken(request({ authorization: `Basic ${SECRET}` }).headers)).toBeNull();
    expect(extractBearerToken(request({ authorization: 'Bearer' }).headers)).toBeNull();
    expect(extractBearerToken(request({ authorization: 'Bearer   ' }).headers)).toBeNull();
  });
});

describe('timingSafeStringEqual', () => {
  it('compares equal, different and different-length values without throwing', () => {
    expect(timingSafeStringEqual(SECRET, SECRET)).toBe(true);
    expect(timingSafeStringEqual(SECRET, `${SECRET}x`)).toBe(false);
    expect(timingSafeStringEqual(SECRET, 'short')).toBe(false);
    expect(timingSafeStringEqual('', SECRET)).toBe(false);
    expect(timingSafeStringEqual('', '')).toBe(true);
  });
});

describe('verifyCronRequest', () => {
  it('is misconfigured when no secret is set, even with a bearer header', () => {
    expect(verifyCronRequest(request({ authorization: `Bearer ${SECRET}` }), {})).toEqual({
      status: 'misconfigured',
    });
    expect(
      verifyCronRequest(request({ authorization: `Bearer ${SECRET}` }), { CRON_SECRET: '  ' }),
    ).toEqual({ status: 'misconfigured' });
  });

  it('is unauthorized without a header or with a wrong secret', () => {
    const env = { CRON_SECRET: SECRET };

    expect(verifyCronRequest(request(), env)).toEqual({ status: 'unauthorized' });
    expect(verifyCronRequest(request({ authorization: 'Bearer wrong-secret' }), env)).toEqual({
      status: 'unauthorized',
    });
    expect(verifyCronRequest(request({ authorization: `Bearer ${SECRET}x` }), env)).toEqual({
      status: 'unauthorized',
    });
  });

  it('authorizes only an exact match and never echoes the secret', () => {
    const env = { CRON_SECRET: SECRET };
    const result = verifyCronRequest(request({ authorization: `Bearer ${SECRET}` }), env);

    expect(result).toEqual({ status: 'authorized' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
