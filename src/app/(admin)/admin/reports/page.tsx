import Link from 'next/link';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { resolveReportTarget, type ReportStatus } from '@/lib/report-service';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/layout';
import { reportDecisionAction } from '@/app/(admin)/admin/actions';

export const instant = false;

const STATUS_TABS: readonly { value: '' | ReportStatus; label: string }[] = [
  { value: 'OPEN', label: 'Offen' },
  { value: '', label: 'Alle' },
  { value: 'DISMISSED', label: 'Verworfen' },
  { value: 'CONTENT_REMOVED', label: 'Inhalt entfernt' },
  { value: 'WARNING_ISSUED', label: 'Verwarnung' },
  { value: 'ACCOUNT_SUSPENDED', label: 'Konto gesperrt' },
];

const REASON_LABELS: Record<string, string> = {
  ILLEGAL: 'Rechtswidriger Inhalt',
  MALWARE: 'Schadcode',
  COPYRIGHT: 'Urheberrecht',
  SPAM: 'Spam',
  MISLEADING: 'Irreführend',
  OTHER: 'Sonstiges',
};

const DECIDED_LABELS: Record<string, string> = {
  DISMISS: 'Meldung verworfen',
  REMOVE: 'Inhalt entfernt',
  WARN: 'Verwarnung erteilt',
  SUSPEND: 'Konto gesperrt',
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; decided?: string }>;
}) {
  const { status: rawStatus, error, decided } = await searchParams;
  const status = STATUS_TABS.some((tab) => tab.value !== '' && tab.value === rawStatus)
    ? (rawStatus as ReportStatus)
    : 'OPEN';

  const reports = await db.orm.public.ContentReport.where({ status })
    .orderBy((report) => report.createdAt.desc())
    .all();

  const [reporters, targets] = await Promise.all([
    Promise.all(reports.map((report) => db.orm.public.User.first({ id: report.reporterId }))),
    Promise.all(
      reports.map((report) => resolveReportTarget(report.targetType, report.targetId)),
    ),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Administration"
        title="Meldungen"
        description="Eine Meldung ist ein Hinweis und keine Feststellung eines Verstoßes. Erst die Entscheidung hier verändert Inhalte oder Konten — jeweils mit Begründung und Audit-Eintrag."
      />

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {decided ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          {DECIDED_LABELS[decided] ?? 'Entscheidung gespeichert'}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.label}
            href={tab.value ? `/admin/reports?status=${tab.value}` : '/admin/reports?status='}
            aria-current={status === tab.value ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              status === tab.value
                ? 'border border-violet-500/20 bg-violet-500/10 text-violet-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-400">
          Keine Meldungen in dieser Ansicht.
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report, index) => {
            const reporter = reporters[index];
            const target = targets[index];

            return (
              <li key={report.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {REASON_LABELS[report.reason] ?? report.reason}
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {report.targetType}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Gemeldet von {reporter?.email ?? report.reporterId} am{' '}
                      {formatDate(report.createdAt)}
                    </p>
                  </div>
                  {target ? (
                    <Link
                      href={`/admin/moderation/${target.kind}/${target.entryId}`}
                      className="text-xs font-semibold text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline"
                    >
                      Gemeldeten Eintrag ansehen
                    </Link>
                  ) : (
                    <span className="text-xs text-zinc-500">Ziel nicht mehr vorhanden</span>
                  )}
                </div>

                {report.details ? (
                  <p className="mt-3 whitespace-pre-line rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm leading-relaxed text-zinc-300">
                    {report.details}
                  </p>
                ) : null}

                {report.status !== 'OPEN' ? (
                  <p className="mt-3 text-xs text-zinc-400">
                    Status: {report.status}
                    {report.resolutionNotes ? ` — ${report.resolutionNotes}` : ''}
                  </p>
                ) : (
                  <form action={reportDecisionAction} className="mt-4 space-y-3">
                    <input type="hidden" name="reportId" value={report.id} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`decision-${report.id}`} className="mb-1 block text-xs font-medium text-zinc-400">
                          Entscheidung
                        </label>
                        <select
                          id={`decision-${report.id}`}
                          name="decision"
                          required
                          defaultValue=""
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                        >
                          <option value="" disabled>
                            Bitte wählen
                          </option>
                          <option value="DISMISS">Meldung verwerfen</option>
                          <option value="REMOVE">Inhalt entfernen</option>
                          <option value="WARN">Konto verwarnen</option>
                          <option value="SUSPEND">Konto sperren</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor={`days-${report.id}`} className="mb-1 block text-xs font-medium text-zinc-400">
                          Sperrdauer in Tagen (leer = dauerhaft)
                        </label>
                        <input
                          id={`days-${report.id}`}
                          name="suspendDays"
                          type="number"
                          min={1}
                          max={3650}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`notes-${report.id}`} className="mb-1 block text-xs font-medium text-zinc-400">
                        Begründung (mindestens 10 Zeichen, erforderlich)
                      </label>
                      <textarea
                        id={`notes-${report.id}`}
                        name="notes"
                        required
                        minLength={10}
                        maxLength={500}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <Button type="submit" size="sm">
                      Entscheidung speichern
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
