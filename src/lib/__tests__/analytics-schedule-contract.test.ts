/**
 * @jest-environment node
 *
 * `vercel.json` and `ANALYTICS_SCHEDULES` are one deployment contract.
 *
 * A schedule name is part of the deployment: renaming one deletes its schedule
 * history, and a name that is not in the registry makes every execution fail
 * with "Unknown analytics schedule". The shared private function only exists
 * because of the `schedule/v1beta` trigger; without it the endpoint would be a
 * public URL, and with a wrong target the schedules simply never run.
 *
 * None of this shows up locally — only in a deployment — so it is asserted here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ANALYTICS_SCHEDULES } from '../analytics/schedules';

// The registry module imports the sync and watchdog runners; this test only
// compares keys, so the heavy modules stay mocked.
jest.mock('../analytics/sync', () => ({
  runAnalyticsSync: jest.fn(),
  runAnalyticsRetention: jest.fn(),
}));

jest.mock('../analytics/watchdog', () => ({ runAnalyticsWatchdog: jest.fn() }));

type VercelConfig = {
  functions?: Record<string, { experimentalTriggers?: { type: string }[] }>;
  schedules?: Record<string, { schedule?: string; timezone?: string; function?: string }>;
};

const TRIGGER_TYPE = 'schedule/v1beta';
/** App Router file of the shared function. */
const ROUTE_FILE = 'src/app/api/schedules/analytics/route.ts';
/** How Vercel addresses that file in `schedules[].function`. */
const FUNCTION_TARGET = 'api/schedules/analytics';

const config = JSON.parse(
  readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig;

const schedules = config.schedules ?? {};
const functions = config.functions ?? {};

describe('vercel.json schedule contract', () => {
  it('declares exactly the schedules that exist in the registry', () => {
    expect(Object.keys(schedules).sort()).toEqual(Object.keys(ANALYTICS_SCHEDULES).sort());
  });

  it('points every schedule at the shared private function', () => {
    for (const [name, entry] of Object.entries(schedules)) {
      expect({ name, function: entry.function }).toEqual({
        name,
        function: FUNCTION_TARGET,
      });
    }
  });

  it('declares the schedule trigger on the route file of that function', () => {
    expect(Object.keys(functions)).toEqual([ROUTE_FILE]);
    expect(functions[ROUTE_FILE]?.experimentalTriggers ?? []).toContainEqual({
      type: TRIGGER_TYPE,
    });
  });

  it('gives every schedule a cron expression and a timezone', () => {
    for (const [name, entry] of Object.entries(schedules)) {
      // A schedule without an expression never runs; without a timezone it runs
      // in whatever the account defaults to. Both are silent in production.
      expect([name, entry.schedule?.trim()]).toEqual([name, expect.any(String)]);
      expect([name, entry.schedule?.trim().split(/\s+/).length]).toEqual([name, 5]);
      expect([name, entry.timezone?.trim()]).toEqual([name, expect.any(String)]);
    }
  });
});
