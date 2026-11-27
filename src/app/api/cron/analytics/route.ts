import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron-auth';
import {
  beginScheduleRun,
  executeAnalyticsSchedule,
  listAnalyticsScheduleNames,
  type ScheduleExecutionOutcome,
} from '@/lib/analytics/schedule-execution';
import type { AnalyticsScheduleName } from '@/lib/analytics/schedules';

/**
 * Portable trigger for the analytics schedules.
 *
 * `POST /api/cron/analytics` runs the same code as the Vercel Schedules
 * function, so a Linux server only needs cron (or a systemd timer):
 *
 *   curl -fsS -X POST "https://<host>/api/cron/analytics?schedule=analytics-traffic" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Without `?schedule=` (or a JSON body `{ "schedule": "…" }`) all schedules run
 * sequentially, in declaration order. Authentication is the shared
 * `CRON_SECRET` bearer token (`@/lib/cron-auth`); without a configured secret
 * the endpoint refuses to run at all. Concurrent runs of the same schedule are
 * rejected with 409 and, in addition, the sync layer keeps durable per-source
 * locks in the database.
 *
 * Only POST is accepted. Responses never contain the secret or connection
 * details.
 */

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

function json(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(body, { status, headers: { ...RESPONSE_HEADERS, ...extraHeaders } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ScheduleSelection =
  | { ok: true; names: AnalyticsScheduleName[] }
  | { ok: false; response: NextResponse };

function isScheduleName(name: string): name is AnalyticsScheduleName {
  return (listAnalyticsScheduleNames() as string[]).includes(name);
}

/**
 * Accepts the schedule from the query string, then from a JSON body. A body is
 * optional, so an empty POST runs everything.
 */
async function selectSchedules(request: Request): Promise<ScheduleSelection> {
  const url = new URL(request.url);
  let requested = url.searchParams.get('schedule')?.trim() ?? '';

  if (requested === '') {
    let body = '';
    try {
      body = await request.text();
    } catch {
      body = '';
    }

    if (body.trim() !== '') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return {
          ok: false,
          response: json(
            { error: 'INVALID_JSON', message: 'Es wird ein JSON-Objekt erwartet.' },
            400,
          ),
        };
      }

      if (!isRecord(parsed)) {
        return {
          ok: false,
          response: json(
            { error: 'INVALID_BODY', message: 'Es wird ein JSON-Objekt erwartet.' },
            400,
          ),
        };
      }

      const candidate = parsed['schedule'];
      if (typeof candidate === 'string') {
        requested = candidate.trim();
      }
    }
  }

  if (requested === '') {
    return { ok: true, names: listAnalyticsScheduleNames() };
  }

  if (!isScheduleName(requested)) {
    return {
      ok: false,
      response: json(
        {
          error: 'INVALID_SCHEDULE',
          message: 'Unbekannter Schedule-Name.',
          known: listAnalyticsScheduleNames(),
        },
        400,
      ),
    };
  }

  return { ok: true, names: [requested] };
}

function summarise(outcomes: ScheduleExecutionOutcome[]) {
  return outcomes.map((outcome) => ({
    schedule: outcome.schedule,
    executionId: outcome.executionId,
    ok: outcome.ok,
    errorCode: outcome.errorCode,
  }));
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = verifyCronRequest(request);

  if (auth.status === 'misconfigured') {
    // Fail closed: a missing secret is a deployment error, not an open door.
    console.error(
      JSON.stringify({
        event: 'cron.analytics.rejected',
        reason: 'CRON_SECRET_MISSING',
        level: 'error',
      }),
    );
    return json(
      {
        error: 'CRON_DISABLED',
        message: 'Der Cron-Endpunkt ist nicht konfiguriert (CRON_SECRET fehlt).',
      },
      503,
    );
  }

  if (auth.status === 'unauthorized') {
    console.warn(
      JSON.stringify({ event: 'cron.analytics.rejected', reason: 'UNAUTHORIZED' }),
    );
    return json({ error: 'UNAUTHORIZED', message: 'Zugriff verweigert.' }, 401);
  }

  const selection = await selectSchedules(request);
  if (!selection.ok) {
    return selection.response;
  }

  const outcomes: ScheduleExecutionOutcome[] = [];

  for (const name of selection.names) {
    const release = beginScheduleRun(name);
    if (release === null) {
      outcomes.push({
        schedule: name,
        executionId: '',
        ok: false,
        errorCode: 'ALREADY_RUNNING',
        result: null,
      });
      continue;
    }

    try {
      outcomes.push(await executeAnalyticsSchedule(name, { source: 'cron' }));
    } finally {
      release();
    }
  }

  const failed = outcomes.filter((outcome) => !outcome.ok);
  const body = { ok: failed.length === 0, executions: summarise(outcomes) };

  if (failed.length === 0) {
    return json(body, 200);
  }

  // A duplicate or locked run is a conflict, not a job error: the caller should
  // retry later rather than treat the schedule as broken.
  const onlyConcurrent = failed.every(
    (outcome) => outcome.errorCode === 'ALREADY_RUNNING' || outcome.errorCode === 'LOCKED',
  );
  if (onlyConcurrent) {
    return json({ ...body, error: 'ALREADY_RUNNING' }, 409);
  }

  return json({ ...body, error: 'JOB_FAILED' }, 500);
}

export function GET(): NextResponse {
  return json(
    { error: 'METHOD_NOT_ALLOWED', message: 'Nur POST ist erlaubt.' },
    405,
    { Allow: 'POST' },
  );
}
