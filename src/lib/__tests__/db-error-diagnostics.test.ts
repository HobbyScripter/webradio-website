/**
 * @jest-environment node
 */
import { describeErrorChain } from '../db-error-diagnostics';

/** Minimal stand-ins for the Prisma 8 error shapes. */
function structured(code: string, cause?: unknown) {
  return Object.assign(new Error('driver failure'), { name: 'CliStructuredError', code, cause });
}

function driver(code: string | undefined, cause?: unknown) {
  return Object.assign(new Error('connection terminated'), {
    name: 'SqlConnectionError',
    ...(code ? { code } : {}),
    cause,
  });
}

describe('describeErrorChain', () => {
  it('reports the driver code hidden behind CONTRACT.MARKER_READ_FAILED', () => {
    // Regression: Prisma 8 verifies prisma_contract.marker on the first query
    // and wraps *any* driver failure as MARKER_READ_FAILED. Logging only the
    // outer error made an unreachable database look like a contract problem.
    const error = structured(
      'CONTRACT.MARKER_READ_FAILED',
      driver(undefined, Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    );

    const diagnostics = describeErrorChain(error);

    expect(diagnostics.name).toBe('CliStructuredError');
    expect(diagnostics.code).toBe('CONTRACT.MARKER_READ_FAILED');
    expect(diagnostics.rootCode).toBe('ECONNREFUSED');
    expect(diagnostics.depth).toBeGreaterThan(0);
  });

  it('extracts a PostgreSQL SQLSTATE used as the driver code', () => {
    const error = structured('CONTRACT.MARKER_READ_FAILED', driver('28P01'));

    const diagnostics = describeErrorChain(error);

    expect(diagnostics.code).toBe('CONTRACT.MARKER_READ_FAILED');
    expect(diagnostics.rootCode).toBe('28P01');
    expect(diagnostics.sqlState).toBe('28P01');
  });

  it('prefers an explicit sqlState field over the code', () => {
    const inner = Object.assign(new Error('invalid input'), {
      name: 'SqlQueryError',
      code: 'UNKNOWN',
      sqlState: '42P01',
    });

    const diagnostics = describeErrorChain(structured('DB.QUERY_FAILED', inner));

    expect(diagnostics.rootCode).toBe('UNKNOWN');
    expect(diagnostics.sqlState).toBe('42P01');
  });

  it('never returns a message, which could contain SQL or host details', () => {
    const error = structured(
      'CONTRACT.MARKER_READ_FAILED',
      driver('ECONNREFUSED', new Error('postgresql://user:secret@host:5432/db')),
    );

    const diagnostics = describeErrorChain(error);

    expect(Object.keys(diagnostics)).not.toContain('message');
    expect(JSON.stringify(diagnostics)).not.toContain('secret');
  });

  it('is safe for primitives and non-error objects', () => {
    expect(describeErrorChain('boom')).toMatchObject({
      name: 'UnknownError',
      code: 'UNKNOWN',
      depth: 0,
    });
    expect(describeErrorChain(null)).toMatchObject({ name: 'UnknownError', code: 'UNKNOWN' });
    expect(describeErrorChain({ code: 1234 })).toMatchObject({ code: '1234' });
  });

  it('stops after the depth limit instead of looping forever', () => {
    let node: unknown = Object.assign(new Error('leaf'), { code: 'LEAF' });
    for (let i = 0; i < 20; i += 1) {
      node = Object.assign(new Error('wrap'), { code: `WRAP_${i}`, cause: node });
    }

    const diagnostics = describeErrorChain(node, 3);

    expect(diagnostics.depth).toBeLessThanOrEqual(3);
  });
});
