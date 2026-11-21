import 'temporal-polyfill/global';
import { db } from '@/lib/db';
import { sendTransactionalEmail, type EmailDeliveryFailure, type EmailDeliveryMode } from '@/lib/email';
import { ANALYTICS_SOURCES } from './sync';

/**
 * Watches the scheduled analytics runs from the outside.
 *
 * Three things can go wrong without anybody noticing, because the sync itself
 * only writes status rows and the failure is otherwise visible only to whoever
 * opens `/admin/analytics/sync`:
 *
 *   - a source has not succeeded for far longer than its daily schedule,
 *   - a run was killed (the 300 s function limit) and is stuck in `RUNNING`,
 *   - the GitHub traffic window is about to close. GitHub serves only 14 days
 *     of traffic, so an outage longer than that loses the days for good —
 *     unlike releases or repository statistics, which can be fetched again at
 *     any time.
 *
 * Alert state is deliberately not persisted: adding a table would require a
 * generated migration, and this module must stay deployable with the existing
 * schema. Instead every finding carries the instant at which its incident
 * *started*. A finding is mailed only while that instant is younger than
 * `ALERT_WINDOW_HOURS`, so a daily watchdog mails once per incident, and a
 * second incident later produces a second mail. The trade-off: if the watchdog
 * itself skips the day on which an incident crosses its threshold, that one
 * mail is lost. The next incident still alerts.
 */

/** Daily schedule plus jitter: anything older than this missed a full day. */
export const SOURCE_STALE_AFTER_HOURS = 28;
/** GitHub only serves the last 14 days of traffic. */
export const TRAFFIC_WINDOW_DAYS = 14;
/** Warn while the remaining days are still enough for a manual recovery. */
export const TRAFFIC_WARNING_REMAINING_DAYS = 4;
/** The window is about to close; the missing days are nearly unrecoverable. */
export const TRAFFIC_CRITICAL_REMAINING_DAYS = 1;
/** The sync lock is 5 minutes, so a run older than this is certainly dead. */
export const ORPHANED_RUN_AFTER_MINUTES = 15;
/** See the module comment: this is what makes "one mail per incident" work. */
export const ALERT_WINDOW_HOURS = 25;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

export type WatchdogSeverity = 'warning' | 'critical';

export type WatchdogFinding = {
  /** Stable identity of the incident, used in logs and the mail only. */
  key: string;
  kind: 'SOURCE_STALE' | 'ORPHANED_RUN' | 'TRAFFIC_WINDOW';
  severity: WatchdogSeverity;
  /** When the condition started; the dedupe anchor. */
  since: string;
  /** Operator-facing text: source names, ages, counts. Never secrets. */
  detail: string;
  /** Whether this run mailed this finding. */
  notified: boolean;
};

export type WatchdogNotification = {
  delivered: boolean;
  mode: EmailDeliveryMode;
  failure?: EmailDeliveryFailure;
};

export type AnalyticsWatchdogResult = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  checkedSources: number;
  findings: WatchdogFinding[];
  orphanedRunsRepaired: number;
  /** `null` when there was nothing to report. */
  notification: WatchdogNotification | null;
  errorCode:
    | 'WATCHDOG_FAILED'
    | 'NOTIFICATION_FAILED'
    | null;
};

type StatusRow = {
  source: unknown;
  lastSuccessAt: unknown;
};

type RunRow = {
  id: string;
  source: unknown;
  startedAt: unknown;
};

type TrafficDayRow = {
  day: unknown;
};

/** Storage may hand back an instant or its text form, depending on the codec. */
function toInstant(value: unknown): Temporal.Instant | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Temporal.Instant) return value;
  try {
    return Temporal.Instant.from(String(value));
  } catch {
    return null;
  }
}

function ageMs(since: Temporal.Instant, now: Temporal.Instant): number {
  return now.epochMilliseconds - since.epochMilliseconds;
}

/**
 * True while an incident counts as new. This is the whole dedupe: no row, no
 * cookie, just the incident's own start instant compared with the current run.
 */
export function isFreshIncident(since: Temporal.Instant, now: Temporal.Instant): boolean {
  const age = ageMs(since, now);
  return age >= 0 && age <= ALERT_WINDOW_HOURS * HOUR_MS;
}

function staleSourceFindings(statuses: StatusRow[], now: Temporal.Instant): WatchdogFinding[] {
  const findings: WatchdogFinding[] = [];

  for (const source of ANALYTICS_SOURCES) {
    const row = statuses.find((candidate) => String(candidate.source) === source);
    const lastSuccess = toInstant(row?.lastSuccessAt);
    // A source that never succeeded has no last success that could age; it is
    // reported by its own failing runs instead of as a stale success.
    if (!lastSuccess) continue;

    const ageHours = Math.floor(ageMs(lastSuccess, now) / HOUR_MS);
    if (ageHours < SOURCE_STALE_AFTER_HOURS) continue;

    // Each severity is its own incident with its own start: the warning fires
    // on the first missed day, the critical escalation once the outage doubled.
    // Anchoring both at the first threshold would put the escalation outside
    // the alert window, so it could never be mailed.
    const critical = ageHours >= SOURCE_STALE_AFTER_HOURS * 2;
    const since = lastSuccess.add({
      hours: critical ? SOURCE_STALE_AFTER_HOURS * 2 : SOURCE_STALE_AFTER_HOURS,
    });

    findings.push({
      key: `source:${source}`,
      kind: 'SOURCE_STALE',
      severity: critical ? 'critical' : 'warning',
      since: String(since),
      detail: `Letzter Erfolg vor ${ageHours} h (Grenze ${SOURCE_STALE_AFTER_HOURS} h).`,
      notified: false,
    });
  }

  return findings;
}

/**
 * The newest stored traffic day is the only signal that matters: every run
 * upserts the last 14 days, so a gap in the middle heals on the next success.
 * What cannot heal is the window sliding past the oldest missing day.
 */
function trafficWindowFindings(newest: Temporal.Instant | null, now: Temporal.Instant): WatchdogFinding[] {
  if (!newest) {
    return [
      {
        key: 'traffic:WINDOW:missing',
        kind: 'TRAFFIC_WINDOW',
        severity: 'critical',
        since: String(now),
        detail: `Keine Traffic-Tageswerte gespeichert. GitHub liefert nur ${TRAFFIC_WINDOW_DAYS} Tage; ohne ersten Lauf beginnt der Verlust sofort.`,
        notified: false,
      },
    ];
  }

  const ageDays = Math.floor(ageMs(newest, now) / DAY_MS);
  const remaining = TRAFFIC_WINDOW_DAYS - ageDays;
  if (remaining > TRAFFIC_WARNING_REMAINING_DAYS) return [];

  const critical = remaining <= TRAFFIC_CRITICAL_REMAINING_DAYS;
  const remainingAtCrossing = critical
    ? TRAFFIC_CRITICAL_REMAINING_DAYS
    : TRAFFIC_WARNING_REMAINING_DAYS;
  // Instant arithmetic has no date units: express the window in hours.
  const since = newest.add({ hours: (TRAFFIC_WINDOW_DAYS - remainingAtCrossing) * 24 });

  return [
    {
      key: `traffic:WINDOW:${critical ? 'critical' : 'warning'}`,
      kind: 'TRAFFIC_WINDOW',
      severity: critical ? 'critical' : 'warning',
      since: String(since),
      detail:
        `Jüngster Traffic-Tag ist ${ageDays} Tage alt. GitHub liefert nur ` +
        `${TRAFFIC_WINDOW_DAYS} Tage, es bleiben ${Math.max(remaining, 0)} Tag(e) zum Nachladen.`,
      notified: false,
    },
  ];
}

/**
 * A scheduled function that exceeds `maxDuration` is killed mid-run, leaving
 * its lock row in `RUNNING` forever. Closing it keeps the admin view honest and
 * turns the kill into a visible failure instead of a permanent "running" state.
 */
async function closeOrphanedRuns(
  now: Temporal.Instant,
): Promise<{ findings: WatchdogFinding[]; repaired: number }> {
  const running = (await db.orm.public.AnalyticsSyncRun.where({
    status: 'RUNNING',
  }).all()) as unknown as RunRow[];

  const findings: WatchdogFinding[] = [];
  let repaired = 0;

  for (const run of running) {
    const startedAt = toInstant(run.startedAt);
    if (!startedAt) continue;

    const minutes = Math.floor(ageMs(startedAt, now) / MINUTE_MS);
    if (minutes < ORPHANED_RUN_AFTER_MINUTES) continue;

    await db.orm.public.AnalyticsSyncRun.where({ id: run.id }).update({
      status: 'FAILED' as never,
      completedAt: now,
      errorCode: 'ORPHANED',
    });
    repaired += 1;

    findings.push({
      key: `run:${run.id}`,
      kind: 'ORPHANED_RUN',
      severity: 'warning',
      since: String(startedAt.add({ minutes: ORPHANED_RUN_AFTER_MINUTES })),
      detail:
        `Lauf für ${String(run.source)} hängt seit ${minutes} min in RUNNING ` +
        `(Sperre 5 min) und wurde als FAILED/ORPHANED geschlossen.`,
      notified: false,
    });
  }

  return { findings, repaired };
}

function buildAlertText(findings: WatchdogFinding[], now: Temporal.Instant): string {
  const lines = [
    'Die geplanten Analytics-Läufe melden ein Problem.',
    '',
    `Zeitpunkt: ${String(now)}`,
    `Befunde: ${findings.length}`,
    '',
  ];

  for (const finding of findings) {
    lines.push(
      `- [${finding.severity}] ${finding.kind} (${finding.key})`,
      `  seit: ${finding.since}`,
      `  ${finding.detail}`,
      '',
    );
  }

  lines.push(
    'Hinweis: Traffic-Daten lassen sich nur 14 Tage nachladen; ein Ausfall darüber',
    'hinaus verliert die betroffenen Tage endgültig.',
    '',
    'Status: /admin/analytics/sync',
  );

  return lines.join('\n');
}

async function notify(
  findings: WatchdogFinding[],
  now: Temporal.Instant,
  overrideRecipient?: string,
): Promise<WatchdogNotification> {
  const recipient = (overrideRecipient ?? process.env['ANALYTICS_ALERT_EMAIL'])?.trim();
  if (!recipient) {
    console.error(
      '[analytics/watchdog] ANALYTICS_ALERT_EMAIL is not set; the alert was not mailed',
    );
    return { delivered: false, mode: 'unconfigured', failure: 'not_configured' };
  }

  const critical = findings.some((finding) => finding.severity === 'critical');
  const result = await sendTransactionalEmail({
    to: recipient,
    subject:
      `[WebRadio] Analytics ${critical ? 'kritisch' : 'Warnung'}: ` +
      `${findings.length} Problem(e)`,
    text: buildAlertText(findings, now),
  });

  if (!result.delivered) {
    console.error('[analytics/watchdog] alert could not be delivered', {
      mode: result.mode,
      failure: result.failure ?? 'unknown',
    });
  }

  return {
    delivered: result.delivered,
    mode: result.mode,
    ...(result.failure ? { failure: result.failure } : {}),
  };
}

/**
 * One watchdog run: collect findings, close orphaned runs, mail the findings
 * whose incident just started. Returns `ok: false` only when the watchdog
 * itself could not do its job — a finding that was mailed successfully is not a
 * watchdog failure, and an undeliverable alert is.
 */
export async function runAnalyticsWatchdog(
  options: { now?: Temporal.Instant; alertRecipient?: string } = {},
): Promise<AnalyticsWatchdogResult> {
  const now = options.now ?? Temporal.Now.instant();
  const startedAt = now;
  const startMs = Date.now();

  let findings: WatchdogFinding[] = [];
  let checkedSources = 0;
  let repaired = 0;

  try {
    const statuses = (await db.orm.public.AnalyticsSourceStatus.all()) as unknown as StatusRow[];
    checkedSources = statuses.length;
    findings = staleSourceFindings(statuses, now);

    const orphans = await closeOrphanedRuns(now);
    findings.push(...orphans.findings);
    repaired = orphans.repaired;

    const trafficRows = (await db.orm.public.GitHubTrafficDaily.orderBy((row) => row.day.desc())
      .limit(1)
      .all()) as unknown as TrafficDayRow[];
    findings.push(...trafficWindowFindings(toInstant(trafficRows[0]?.day), now));
  } catch {
    // The database answer is unknown: report the watchdog itself, never a
    // green run that checked nothing.
    return {
      ok: false,
      startedAt: String(startedAt),
      completedAt: String(Temporal.Now.instant()),
      durationMs: Date.now() - startMs,
      checkedSources,
      findings,
      orphanedRunsRepaired: repaired,
      notification: null,
      errorCode: 'WATCHDOG_FAILED',
    };
  }

  const fresh = findings.filter((finding) => {
    const since = toInstant(finding.since);
    return since !== null && isFreshIncident(since, now);
  });

  let notification: WatchdogNotification | null = null;
  if (fresh.length > 0) {
    notification = await notify(fresh, now, options.alertRecipient);
    if (notification.delivered) {
      for (const finding of fresh) {
        finding.notified = true;
      }
    }
  }

  return {
    ok: notification === null || notification.delivered,
    startedAt: String(startedAt),
    completedAt: String(Temporal.Now.instant()),
    durationMs: Date.now() - startMs,
    checkedSources,
    findings,
    orphanedRunsRepaired: repaired,
    notification,
    errorCode:
      notification !== null && !notification.delivered ? 'NOTIFICATION_FAILED' : null,
  };
}
