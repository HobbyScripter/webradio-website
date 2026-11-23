/**
 * Partnership duration formatting (pure, no database).
 *
 * The calendar arithmetic existed before the Prisma 8 repair; these tests pin
 * the behaviour so the extraction into `src/lib/partner/duration.ts` cannot
 * silently change the text shown on the public partner page.
 */
import { calculateDuration, earliestRelationshipStart } from '../partner/duration';

describe('calculateDuration', () => {
  it('formats whole years, months and days', () => {
    expect(calculateDuration(new Date('2020-01-15T00:00:00Z'), new Date('2023-03-20T00:00:00Z'))).toBe(
      '3 Jahre, 2 Monate, 5 Tage',
    );
  });

  it('uses singular forms for one year and one month', () => {
    expect(calculateDuration('2020-01-01T00:00:00Z', '2021-01-01T00:00:00Z')).toBe('1 Jahr');
    expect(calculateDuration('2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z')).toBe('1 Monat');
  });

  it('borrows days from the previous month when the day is negative', () => {
    // 10 Jan -> 5 Feb: monthDiff becomes -1 -> 0 after the day borrow, and the
    // 5 remaining days plus January's 31 days give 26 days.
    expect(calculateDuration('2024-01-10T00:00:00Z', '2024-02-05T00:00:00Z')).toBe('26 Tage');
  });

  it('answers "0 Tage" for the same day', () => {
    expect(calculateDuration('2024-05-01T00:00:00Z', '2024-05-01T00:00:00Z')).toBe('0 Tage');
  });

  it('treats a missing end date as "today"', () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    start.setDate(start.getDate() - 1);
    const result = calculateDuration(start);
    expect(result).toMatch(/Jahr/);
  });

  it('accepts an ISO string from a JSON API and never renders NaN', () => {
    expect(calculateDuration('2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')).toBe(
      '1 Jahr',
    );
    expect(calculateDuration('', '2025-01-01T00:00:00.000Z')).toBe('0 Tage');
    expect(calculateDuration('not-a-date', null)).toBe('0 Tage');
  });

  it('accepts a Temporal-like value that only stringifies to ISO', () => {
    const instant = { toString: () => '2022-03-01T00:00:00Z' };
    expect(calculateDuration(instant, '2023-03-01T00:00:00Z')).toBe('1 Jahr');
    expect(earliestRelationshipStart([{ startDate: instant }])).toBe('2022-03-01T00:00:00.000Z');
  });
});

describe('earliestRelationshipStart', () => {
  it('returns the original start across several concurrent relationship types', () => {
    const start = earliestRelationshipStart([
      { startDate: '2024-03-01T00:00:00Z' },
      { startDate: '2021-05-01T00:00:00Z' },
      { startDate: '2023-01-15T00:00:00Z' },
    ]);

    expect(start).toBe('2021-05-01T00:00:00.000Z');
  });

  it('ignores invalid dates and answers null without relationships', () => {
    expect(earliestRelationshipStart([])).toBeNull();
    expect(
      earliestRelationshipStart([
        { startDate: 'kein-datum' },
        { startDate: '2022-09-10T00:00:00Z' },
      ]),
    ).toBe('2022-09-10T00:00:00.000Z');
  });
});
