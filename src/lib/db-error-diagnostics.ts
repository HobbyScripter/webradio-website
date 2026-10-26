/**
 * Structured, secret-free diagnostics for a failed database operation.
 *
 * Prisma 8's runtime verifies the contract marker (`prisma_contract.marker`)
 * on the first query of a runtime instance. A *connection* failure during that
 * probe is re-thrown by `withMarkerReadErrorHandling` as
 * `CONTRACT.MARKER_READ_FAILED`, with the driver error nested in `cause`:
 *
 *   CliStructuredError  CONTRACT.MARKER_READ_FAILED
 *     └─ SqlConnectionError  "Connection terminated unexpectedly"
 *          └─ Error            (ECONNREFUSED / 28P01 / ...)
 *
 * Logging only the outermost `name` and `code` therefore reports
 * `MARKER_READ_FAILED` for a database that is simply unreachable, which is
 * misleading. This helper walks the `cause` chain and reports the driver-level
 * code and PostgreSQL SQLSTATE as well.
 *
 * Deliberately omitted: every `message`. Driver messages can embed the SQL
 * text, statement parameters or host details, none of which belong in logs.
 * Only the class name and the error code are returned.
 */

export type ErrorDiagnostics = {
  /** Class name of the error the caller caught. */
  name: string;
  /** Dotted code of that error (`CONTRACT.*`, `DRIVER.*`, `ORM.*`, ...). */
  code: string;
  /** Code of the innermost cause that has one, if different. */
  rootCode?: string;
  /** PostgreSQL SQLSTATE, when the driver exposed one. */
  sqlState?: string;
  /** Number of `cause` hops inspected, capped by `maxDepth`. */
  depth: number;
};

const MAX_DEPTH = 6;

/** SQLSTATE is a five-character code: digits and upper-case letters. */
function looksLikeSqlState(value: string): boolean {
  return /^[0-9A-Z]{5}$/.test(value) && /[0-9]/.test(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/**
 * Describe an error and its cause chain without exposing driver messages.
 * Accepts anything: a thrown primitive yields `UnknownError`/`UNKNOWN`.
 */
export function describeErrorChain(error: unknown, maxDepth = MAX_DEPTH): ErrorDiagnostics {
  const first = asRecord(error);
  const diagnostics: ErrorDiagnostics = {
    name: typeof first?.name === 'string' ? first.name : 'UnknownError',
    code: first ? (readString(first, 'code') ?? 'UNKNOWN') : 'UNKNOWN',
    depth: 0,
  };

  let current: Record<string, unknown> | undefined = first;
  let lastCode: string | undefined;
  let sqlState: string | undefined;

  for (let hop = 0; current && hop < maxDepth; hop += 1) {
    const code = readString(current, 'code');
    if (code) {
      lastCode = code;
    }
    const state = readString(current, 'sqlState') ?? readString(current, 'sqlstate');
    if (state) {
      sqlState = state;
    } else if (code && looksLikeSqlState(code)) {
      // node-postgres / Prisma drivers surface SQLSTATE as `code`.
      sqlState = code;
    }

    const next = current['cause'] ?? current['error'] ?? current['originalError'];
    const nextRecord = asRecord(next);
    if (!nextRecord) {
      break;
    }
    current = nextRecord;
    diagnostics.depth = hop + 1;
  }

  if (lastCode && lastCode !== diagnostics.code) {
    diagnostics.rootCode = lastCode;
  }
  if (sqlState) {
    diagnostics.sqlState = sqlState;
  }

  return diagnostics;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
