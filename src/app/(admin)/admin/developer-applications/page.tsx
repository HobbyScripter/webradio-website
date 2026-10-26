import Link from 'next/link';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { safeHttpUrl } from '@/lib/site';
import { hasRole } from '@/lib/roles';
import type { Role } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/layout';
import { decideDeveloperApplicationAction } from '@/app/(admin)/admin/actions';

export const instant = false;

const STATUS_TABS = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const STATUS_LABELS: Record<StatusTab, string> = {
  PENDING: 'Offen',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  WITHDRAWN: 'Zurückgezogen',
};

export default async function AdminDeveloperApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; decided?: string }>;
}) {
  const { status: rawStatus, error, decided } = await searchParams;
  const status: StatusTab = (STATUS_TABS as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as StatusTab)
    : 'PENDING';

  const applications = await db.orm.public.DeveloperApplication.where({ status })
    .orderBy((application) => application.createdAt.desc())
    .all();

  const applicants = await Promise.all(
    applications.map((application) => db.orm.public.User.first({ id: application.userId })),
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Administration"
        title="Entwickleranträge"
        description="Anträge werden ausschließlich hier entschieden. Eine Genehmigung setzt die Entwicklerrolle serverseitig über den zentralen Rollenwechsel und wird auditiert."
      />

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {decided ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          Entscheidung gespeichert: {decided === 'APPROVED' ? 'genehmigt' : 'abgelehnt'}.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/admin/developer-applications?status=${tab}`}
            aria-current={status === tab ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              status === tab
                ? 'border border-violet-500/20 bg-violet-500/10 text-violet-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {STATUS_LABELS[tab]}
          </Link>
        ))}
      </div>

      {applications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-400">
          Keine Anträge in dieser Ansicht.
        </p>
      ) : (
        <ul className="space-y-4">
          {applications.map((application, index) => {
            const applicant = applicants[index];
            const portfolio = safeHttpUrl(application.portfolioUrl);

            return (
              <li
                key={application.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {applicant?.name ?? 'Ohne Namen'}
                      {applicant && hasRole(applicant.role as Role, 'DEVELOPER') ? (
                        <span className="ml-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          bereits Entwickler
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">{applicant?.email ?? application.userId}</p>
                  </div>
                  <p className="text-xs text-zinc-500">Eingereicht am {formatDate(application.createdAt)}</p>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {application.motivation}
                </p>

                {portfolio ? (
                  <p className="mt-2 text-xs">
                    <a
                      href={portfolio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline"
                    >
                      {portfolio}
                    </a>
                  </p>
                ) : null}

                {application.decisionNotes ? (
                  <p className="mt-3 whitespace-pre-line rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs leading-relaxed text-zinc-300">
                    Entscheidung: {application.decisionNotes}
                  </p>
                ) : null}

                {application.status === 'PENDING' ? (
                  <div className="mt-4 space-y-3">
                    <form action={decideDeveloperApplicationAction} className="space-y-3">
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <label htmlFor={`notes-approve-${application.id}`} className="block text-xs font-medium text-zinc-400">
                        Optionale Notiz zur Genehmigung
                      </label>
                      <input
                        id={`notes-approve-${application.id}`}
                        name="notes"
                        maxLength={500}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                      />
                      <Button type="submit" size="sm">
                        Genehmigen
                      </Button>
                    </form>

                    <form action={decideDeveloperApplicationAction} className="space-y-3 border-t border-zinc-800 pt-3">
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <label htmlFor={`notes-reject-${application.id}`} className="block text-xs font-medium text-zinc-400">
                        Begründung der Ablehnung (erforderlich)
                      </label>
                      <textarea
                        id={`notes-reject-${application.id}`}
                        name="notes"
                        required
                        minLength={10}
                        maxLength={500}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
                      />
                      <Button type="submit" size="sm" variant="secondary">
                        Ablehnen
                      </Button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
