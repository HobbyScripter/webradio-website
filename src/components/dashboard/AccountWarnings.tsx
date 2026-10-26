import type { AccountWarning } from '@/lib/report-service';
import { formatDateTime } from '@/lib/format';

/**
 * Warnings issued to the signed-in account.
 *
 * Presentational only: the caller loads the warnings for the session user. The
 * note about the paused mail delivery is deliberate — a warning is recorded
 * without sending anything, and the account page must not suggest otherwise.
 */
export default function AccountWarnings({ warnings }: { warnings: AccountWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="account-warnings-heading"
      className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-5"
    >
      <h2 id="account-warnings-heading" className="text-base font-semibold text-rose-200">
        Verwarnungen
      </h2>
      <p className="mt-1 text-sm text-rose-200/80">
        Ein Administrator hat Inhalte deines Kontos beanstandet. Der E-Mail-Versand ist derzeit
        deaktiviert; es wurde keine Nachricht verschickt.
      </p>
      <ul className="mt-4 space-y-3">
        {warnings.map((warning) => (
          <li
            key={warning.id}
            className="rounded-lg border border-rose-500/15 bg-black/20 p-3"
          >
            <p className="text-xs text-rose-300/80">
              {formatDateTime(warning.issuedAt) ?? 'Zeitpunkt unbekannt'}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-rose-100">
              {warning.reason ?? 'Keine Begründung hinterlegt.'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
