import Link from 'next/link';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { requireAdminSession } from '@/lib/server-auth';
import {
  getPublishedLegalDocument,
  listLegalDocumentVersions,
  getLegalDocumentById,
} from '@/lib/legal-document-service';
import {
  saveLegalDraftAction,
  publishLegalAction,
  restoreLegalVersionAction,
} from '@/app/(admin)/admin/actions';
import { ArrowLeftIcon, CheckIcon } from '@/components/ui/icons';

export const instant = false;

const LABELS: Record<string, string> = {
  IMPRESSUM: 'Impressum',
  DATENSCHUTZ: 'Datenschutzerklärung',
  NUTZUNGSBEDINGUNGEN: 'Nutzungsbedingungen',
};

const VALID = new Set(['IMPRESSUM', 'DATENSCHUTZ', 'NUTZUNGSBEDINGUNGEN']);

export default async function AdminLegalTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const [{ type }, query] = await Promise.all([params, searchParams]);
  if (!VALID.has(type)) notFound();
  await connection();
  await requireAdminSession();

  const versions = await listLegalDocumentVersions(type as 'IMPRESSUM' | 'DATENSCHUTZ' | 'NUTZUNGSBEDINGUNGEN');
  const published = await getPublishedLegalDocument(type as 'IMPRESSUM' | 'DATENSCHUTZ' | 'NUTZUNGSBEDINGUNGEN');

  const draftId = query.draft ?? '';
  let draft = draftId ? await getLegalDocumentById(draftId) : null;
  if (!draft) {
    // Use latest draft if present
    draft = versions.find((v) => v.status === 'DRAFT') ?? null;
  }
  if (!draft && published) {
    // Start from published content as a new draft is not persisted until save.
  }

  const startingContent = draft?.content ?? published?.content ?? '';
  const startingChange = draft?.changeDescription ?? '';
  const startingRequiresConsent = draft?.requiresConsent ?? false;
  const startingTitle = draft?.title ?? published?.title ?? '';

  const notices: Record<string, string> = {
    saved: 'Entwurf gespeichert.',
    published: 'Version veröffentlicht.',
  };
  const successKey = Object.keys(notices).find((key) => query[key]);
  const success = successKey ? notices[successKey] : null;

  const typeLabel = LABELS[type] ?? type;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/legal"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück zur Übersicht
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{typeLabel} verwalten</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {published ? `Veröffentlicht: Version ${published.versionNumber}` : 'Noch keine veröffentlichte Version.'}
          {draft ? ` · Entwurf: Version ${draft.versionNumber}` : ''}
        </p>
      </div>

      {success ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {query.error}
        </p>
      ) : null}

      <form action={saveLegalDraftAction} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <input type="hidden" name="type" value={type} />
        {draft ? <input type="hidden" name="documentId" value={draft.id} /> : null}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Titel (optional)</label>
          <input
            name="title"
            defaultValue={startingTitle ?? ''}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Inhalt</label>
          <textarea
            name="content"
            required
            minLength={1}
            rows={18}
            defaultValue={startingContent}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white resize-y"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Reiner Text/Markdown. HTML wird nicht ausgeführt. Überschriften mit #, Listen mit - oder 1., Zitate mit &gt;.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Änderungsbeschreibung</label>
          <input
            name="changeDescription"
            defaultValue={startingChange ?? ''}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white"
          />
        </div>

        {type === 'NUTZUNGSBEDINGUNGEN' ? (
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              name="requiresConsent"
              value="true"
              defaultChecked={startingRequiresConsent}
            />
            Erneute Zustimmung der Nutzer erforderlich
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
          >
            Entwurf speichern
          </button>
          <button
            type="submit"
            formAction={publishLegalAction}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <CheckIcon className="h-4 w-4" />
            Veröffentlichen
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="text-lg font-semibold text-white">Versionsverlauf</h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Noch keine Versionen.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 p-3">
                <div>
                  <span className="font-medium text-white">Version {v.versionNumber}</span>
                  <span className="ml-2 text-xs text-zinc-500">{v.status}</span>
                  {v.publishedAt ? <span className="ml-2 text-xs text-zinc-500">· {v.publishedAt}</span> : null}
                  {v.changeDescription ? <div className="text-xs text-zinc-400">{v.changeDescription}</div> : null}
                </div>
                <form action={restoreLegalVersionAction}>
                  <input type="hidden" name="type" value={type} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <button type="submit" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">
                    Wiederherstellen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}