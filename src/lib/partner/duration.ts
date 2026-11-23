/**
 * Partnership duration formatting.
 *
 * Pure module (no Prisma, no Next.js) so the admin service and the public
 * partner page can format a duration without importing the database client.
 *
 * The calendar arithmetic is the implementation that already shipped: whole
 * years, then whole months, then remaining days, measured in the local
 * calendar. It is kept verbatim so the displayed text does not change.
 */
/**
 * Accepted date values: ISO strings, `Date` objects and Prisma 8
 * `Temporal.Instant` values (which stringify to ISO-8601).
 */
export type DurationDate = string | Date | { toString(): string };

function toCalendarDate(value: DurationDate): Date {
  return value instanceof Date ? value : new Date(String(value));
}

/**
 * The original partnership start: the earliest valid relationship start date.
 *
 * A partner can hold several relationship types at once (official partner,
 * sponsor, technical partner …). "Partner seit" must refer to the first one, not
 * to whichever row happens to be first in the list (finding D8).
 */
export function earliestRelationshipStart(
  relationships: readonly { startDate: DurationDate }[],
): string | null {
  let earliest: Date | null = null;

  for (const relationship of relationships) {
    const start = toCalendarDate(relationship.startDate);
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    if (!earliest || start.getTime() < earliest.getTime()) {
      earliest = start;
    }
  }

  return earliest ? earliest.toISOString() : null;
}

export function calculateDuration(
  startDate: DurationDate,
  endDate?: DurationDate | null,
): string {
  const start = toCalendarDate(startDate);
  const end = endDate ? toCalendarDate(endDate) : new Date();

  // A malformed date (for example an empty optional field serialized as "")
  // must not render "NaN Jahre".
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '0 Tage';
  }

  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  const days = end.getDate() - start.getDate();

  let yearDiff = years;
  let monthDiff = months;
  let dayDiff = days;

  if (dayDiff < 0) {
    monthDiff--;
    const daysInPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    dayDiff += daysInPrevMonth;
  }

  if (monthDiff < 0) {
    yearDiff--;
    monthDiff += 12;
  }

  const parts: string[] = [];
  if (yearDiff > 0) parts.push(`${yearDiff} Jahr${yearDiff !== 1 ? 'e' : ''}`);
  if (monthDiff > 0) parts.push(`${monthDiff} Monat${monthDiff !== 1 ? 'e' : ''}`);
  if (dayDiff > 0) parts.push(`${dayDiff} Tag${dayDiff !== 1 ? 'e' : ''}`);

  return parts.length > 0 ? parts.join(', ') : '0 Tage';
}
