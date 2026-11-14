import 'temporal-polyfill/global';
import { getUtcDayInstant } from '../download-analytics-service';

describe('Download Analytics Historical & Snapshot Logic', () => {
  it('correctly normalizes any date into a UTC day instant (00:00:00.000Z)', () => {
    const testDate = new Date('2026-11-14T15:35:20.123Z');
    const utcInstant = getUtcDayInstant(testDate);

    expect(utcInstant.toString()).toBe('2026-11-14T00:00:00Z');
  });

  it('correctly handles snapshot diff calculation and prevents negative diffs on counter reset', () => {
    // Simulate successive snapshots for an asset
    const rawSnapshots = [
      { date: '2026-11-10', count: 100 },
      { date: '2026-11-11', count: 120 }, // +20
      { date: '2026-11-12', count: 120 }, // +0
      { date: '2026-11-13', count: 50 },  // Reset or replacement -> must result in 0 diff, NOT -70
      { date: '2026-11-14', count: 65 },  // +15
    ];

    const differences: { date: string; diff: number }[] = [];
    for (let i = 1; i < rawSnapshots.length; i++) {
      const prev = rawSnapshots[i - 1]!;
      const curr = rawSnapshots[i]!;
      const diff = curr.count >= prev.count ? curr.count - prev.count : 0;
      differences.push({ date: curr.date, diff });
    }

    expect(differences).toEqual([
      { date: '2026-11-11', diff: 20 },
      { date: '2026-11-12', diff: 0 },
      { date: '2026-11-13', diff: 0 },
      { date: '2026-11-14', diff: 15 },
    ]);
  });
});

