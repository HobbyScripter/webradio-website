import Link from 'next/link';
import { connection } from 'next/server';
import { requireAdminSession } from '@/lib/server-auth';
import { getPublishedLegalDocument, listPrivacyImpactNotes } from '@/lib/legal-document-service';
import { markPrivacyImpactAction } from '@/app/(admin)/admin/actions';
import { BookIcon, ArrowRightIcon } from '@/components/ui/icons';
import { ButtonLink } from '@/components/ui/button';

export const instant = false;

const DOCS: { type: 'IMPRESSUM' | 'DATENSCHUTZ' | 'NUTZUNGSBEDINGUNGEN'; label: string; href: string; publicHref: string }[] = [
  { type: 'IMPRESSUM', label: 'Impressum', href: '/admin/legal/IMPRESSUM', publicHref: '/impressum' },
  { type: 'DATENSCHUTZ', label: 'Datenschutzerklärung', href: '/admin/legal/DATENSCHUTZ', publicHref: '/datenschutz' },
  { type: 'NUTZUNGSBEDINGUNGEN', label: 'Nutzungsbedingungen', href: '/admin/legal/NUTZUNGSBEDINGUNGEN', publicHref: '/nutzungsbedingungen' },
];

export default async function AdminLegalPage() {
  await connection();
  await requireAdminSession();
  const published = await Promise.all(DOCS.map((doc) => getPublishedLegalDocument(doc.type)));
  const notes = await listPrivacyImpactNotes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <BookIcon className="h-6 w-6" />
          Rechtliche Inhalte
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Impressum, Datenschutzerklärung und Nutzungsbedingungen zentral verwalten, versionieren und veröffentlichen.
        </p>
      </div>

      <div className="grid gap-4">
        {DOCS.map((doc, index) => {
          const pub = published[index];
          return (
            <div key={doc.type} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{doc.label}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {pub
                      ? `Veröffentlicht: Version ${pub.versionNumber} · ${pub.publishedAt ?? '—'}`
                      : 'Noch keine veröffentlichte Version.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ButtonLink href={doc.href} size="sm" variant="secondary">
                    Verwalten
                    <ArrowRightIcon className="h-4 w-4" />
                  </ButtonLink>
                  {pub ? (
                    <ButtonLink href={doc.publicHref} size="sm" variant="ghost">
                      Öffentliche Seite
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white">Datenschutzrelevante Änderung markieren</h2>
        <form action={markPrivacyImpactAction} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Bereich</label>
            <input
              name="area"
              placeholder="z. B. Registrierung, Analyse, Drittanbieter"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Beschreibung</label>
            <textarea
              name="description"
              required
              rows={4}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white resize-y"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
          >
            Markierung speichern
          </button>
        </form>

        {notes.length > 0 ? (
          <ul className="space-y-2">
            {notes.slice(0, 10).map((note) => (
              <li key={note.id} className="rounded-lg border border-zinc-800 p-3 text-sm">
                <div className="font-medium text-white">{note.area}</div>
                <div className="text-xs text-zinc-400">{note.description}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}