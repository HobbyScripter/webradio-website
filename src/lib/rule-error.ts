/**
 * A business-rule rejection (allowed status transitions, date ordering).
 *
 * These are client mistakes with a precise, safe message, so the shared error
 * handler answers them with HTTP 400 instead of a generic 500.
 */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}
