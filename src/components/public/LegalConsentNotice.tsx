import Link from 'next/link';
import { getServerAuthSession } from '@/lib/server-auth';
import { listOutstandingLegalConsents } from '@/lib/legal-document-service';
import { LEGAL_PAGE_LABELS, LEGAL_PAGE_PATHS } from '@/lib/legal-labels';
import { acceptLegalVersionAction } from '@/app/(public)/legal-consent-action';
import { CheckIcon } from '@/components/ui/icons';

/**
 * Notice for signed-in users after a new terms or privacy version has been
 * published with "renewed consent" enabled. It is rendered inside a Suspense
 * boundary, so public pages keep their partial prerender.
 */
export default async function LegalConsentNotice() {
  const session = await getServerAuthSession();
  if (!session) return null;

  let outstanding;
  try {
    outstanding = await listOutstandingLegalConsents(session.user.id);
  } catch {
    return null;
  }

  if (outstanding.length === 0) return null;

  return (
    <div className="border-b border-amber-400/20 bg-amber-500/[0.07]">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-amber-100">Neue Fassung der Rechtstexte</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
              {outstanding.map((document) => LEGAL_PAGE_LABELS[document.type]).join(' und ')}{' '}
              {outstanding.length === 1 ? 'wurde' : 'wurden'} aktualisiert. Bitte bestätige die neue
              Fassung; die Bestätigung wird mit Version und Zeitpunkt gespeichert.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {outstanding.map((document) => (
                <Link
                  key={document.id}
                  href={LEGAL_PAGE_PATHS[document.type]}
                  className="text-amber-200 underline underline-offset-4 hover:text-white"
                >
                  {LEGAL_PAGE_LABELS[document.type]} lesen (Version {document.versionNumber})
                </Link>
              ))}
            </div>
          </div>

          <form action={acceptLegalVersionAction} className="shrink-0">
            <input type="hidden" name="next" value="/" />
            {outstanding.map((document) => (
              <input key={document.id} type="hidden" name="documentId" value={document.id} />
            ))}
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              <CheckIcon className="h-4 w-4" /> Fassung bestätigen
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
