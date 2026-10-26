import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUserSession } from '@/lib/server-auth';
import { AuthError } from '@/lib/auth-service';
import { consumeRateLimitSafely } from '@/lib/rate-limit';
import { hasRole } from '@/lib/roles';
import { developerApplicationSchema } from '@/lib/validations';
import {
  listOwnApplications,
  requestDeveloperAccess,
  withdrawDeveloperApplication,
} from '@/lib/developer-application-service';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/layout';
import {
  CodeIcon,
  CheckIcon,
  AlertIcon,
  ClockIcon,
  ArrowRightIcon,
} from '@/components/ui/icons';

// Session-guarded page: request data, never prerendered.
export const instant = false;

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'In Prüfung',
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  },
  APPROVED: {
    label: 'Genehmigt',
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  },
  REJECTED: {
    label: 'Abgelehnt',
    className: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  },
  WITHDRAWN: {
    label: 'Zurückgezogen',
    className: 'border-zinc-600/30 bg-zinc-600/10 text-zinc-400',
  },
};

export default async function AccountDeveloperPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; submitted?: string; withdrawn?: string }>;
}) {
  const { error, submitted, withdrawn } = await searchParams;
  const user = await requireUserSession();
  const applications = await listOwnApplications(user.id);
  const pending = applications.find((application) => application.status === 'PENDING');
  const isDeveloper = hasRole(user.role, 'DEVELOPER');

  async function submitApplication(formData: FormData): Promise<void> {
    'use server';

    const currentUser = await requireUserSession();

    try {
      const decision = await consumeRateLimitSafely({
        scope: 'developerApplication',
        identifier: currentUser.id,
      });
      if (!decision.allowed) {
        throw new AuthError(
          'Zu viele Anträge in kurzer Zeit. Bitte versuche es später erneut.',
          429,
          'RATE_LIMITED',
        );
      }

      const parsed = developerApplicationSchema.safeParse({
        motivation: formData.get('motivation'),
        portfolioUrl: formData.get('portfolioUrl') || undefined,
      });
      if (!parsed.success) {
        throw new AuthError(
          [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' '),
          400,
          'VALIDATION_ERROR',
        );
      }

      await requestDeveloperAccess({
        userId: currentUser.id,
        motivation: parsed.data.motivation,
        portfolioUrl: parsed.data.portfolioUrl || null,
      });

      revalidatePath('/account/developer');
      redirect('/account/developer?submitted=1');
    } catch (caught) {
      if (caught instanceof AuthError) {
        redirect(`/account/developer?error=${encodeURIComponent(caught.message)}`);
      }
      throw caught;
    }
  }

  async function withdrawApplication(): Promise<void> {
    'use server';

    const currentUser = await requireUserSession();

    try {
      await withdrawDeveloperApplication({ userId: currentUser.id });
      revalidatePath('/account/developer');
      redirect('/account/developer?withdrawn=1');
    } catch (caught) {
      if (caught instanceof AuthError) {
        redirect(`/account/developer?error=${encodeURIComponent(caught.message)}`);
      }
      throw caught;
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Konto"
        title="Entwicklerzugang"
        description="Der Zugang zum Entwicklerportal ist eine eigene, von der Administration geprüfte Berechtigung. Eine Registrierung allein vergibt keine Entwicklerrechte."
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {submitted ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200"
        >
          Antrag eingereicht. Du siehst den Status hier, sobald er entschieden wurde.
        </p>
      ) : null}
      {withdrawn ? (
        <p
          role="status"
          className="rounded-xl border border-zinc-700 bg-zinc-800/40 px-4 py-3 text-sm text-zinc-200"
        >
          Antrag zurückgezogen. Du kannst jederzeit einen neuen Antrag stellen.
        </p>
      ) : null}

      {isDeveloper ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Entwicklerrechte aktiv</h2>
              <p className="mt-1 text-sm text-emerald-200/80">
                Dein Konto hat Zugriff auf das Developer-Dashboard.
              </p>
            </div>
          </div>
          <Link
            href="/developer"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Zum Developer-Dashboard
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : pending ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-amber-500/10 p-2 text-amber-300">
              <ClockIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Antrag in Prüfung</h2>
              <p className="mt-1 text-sm text-amber-200/80">
                Eingereicht am {formatDate(pending.createdAt)}. Eine Administratorin oder ein
                Administrator prüft den Antrag. Bis zur Entscheidung bleiben die
                Entwicklerfunktionen gesperrt.
              </p>
            </div>
          </div>
          <form action={withdrawApplication} className="mt-5">
            <Button type="submit" variant="secondary" size="sm">
              Antrag zurückziehen
            </Button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-violet-500/10 p-2 text-violet-400">
              <CodeIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Entwicklerzugang beantragen</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Beschreibe kurz, was du für WebRadio veröffentlichen möchtest. Der Antrag wird
                geprüft; ein Anspruch auf Freischaltung besteht nicht.
              </p>
            </div>
          </div>

          <form action={submitApplication} className="mt-6 space-y-5">
            <div>
              <label htmlFor="motivation" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Begründung <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="motivation"
                name="motivation"
                required
                minLength={50}
                maxLength={2000}
                rows={6}
                aria-describedby="motivation-hint"
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="Was möchtest du veröffentlichen und welche Erfahrung bringst du mit?"
              />
              <p id="motivation-hint" className="mt-1 text-xs text-zinc-500">
                50 bis 2000 Zeichen. Wird ausschließlich als Text gespeichert.
              </p>
            </div>

            <div>
              <label htmlFor="portfolioUrl" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Portfolio- oder Projektlink (optional)
              </label>
              <input
                id="portfolioUrl"
                name="portfolioUrl"
                type="url"
                placeholder="https://github.com/benutzername"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Mit dem Antrag werden keine Rechte vergeben. Erst eine serverseitige Entscheidung
              durch die Administration kann die Entwicklerrolle setzen.
            </p>

            <Button type="submit" size="md">
              Antrag einreichen
            </Button>
          </form>
        </div>
      )}

      {applications.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-sm font-semibold text-zinc-300">Deine Anträge</h2>
          <ul className="mt-3 divide-y divide-zinc-800">
            {applications.map((application) => {
              const meta = STATUS_META[application.status] ?? {
                label: application.status,
                className: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
              };
              return (
                <li key={application.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200">
                      Eingereicht am {formatDate(application.createdAt)}
                    </p>
                    {application.decisionNotes ? (
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-400">
                        Begründung der Entscheidung: {application.decisionNotes}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
