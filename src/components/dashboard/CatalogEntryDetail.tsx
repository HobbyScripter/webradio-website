import Link from 'next/link';
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  PlugIcon,
  PaletteIcon,
  CheckIcon,
  ArchiveIcon,
  AlertIcon,
  ClockIcon,
} from '@/components/ui/icons';
import CatalogStatusBadge from './CatalogStatusBadge';
import DangerActionForm from './DangerActionForm';
import { canSubmitForReview } from '@/lib/catalog-workflow';
import type { CatalogKind } from '@/lib/catalog-workflow';
import {
  deletePluginAction,
  deleteThemeAction,
  submitPluginAction,
  submitThemeAction,
  withdrawPluginAction,
  withdrawThemeAction,
} from '@/app/(developer)/developer/actions';

export type CatalogEntryView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  isPublished: boolean;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

export type VersionView = {
  id: string;
  version: string;
  description: string | null;
  releasedAt: string;
  fileSize: number;
  isLatest: boolean;
};

const ACTIONS = {
  PLUGIN: {
    submit: submitPluginAction,
    withdraw: withdrawPluginAction,
    remove: deletePluginAction,
  },
  THEME: {
    submit: submitThemeAction,
    withdraw: withdrawThemeAction,
    remove: deleteThemeAction,
  },
} as const;

function Notice({ message, tone }: { message: string; tone: 'success' | 'info' | 'error' }) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200'
      : tone === 'error'
        ? 'border-rose-400/20 bg-rose-500/[0.06] text-rose-200'
        : 'border-violet-400/20 bg-violet-500/[0.06] text-violet-200';

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${toneClass}`}
    >
      {message}
    </div>
  );
}

/**
 * Shared developer-facing detail page. The ownership check lives in the page
 * query (developerId filter); this component only renders what it is given.
 */
export default function CatalogEntryDetail({
  kind,
  entry,
  versions,
  tags,
  reviews,
  screenshotCount,
  notice,
  error,
}: {
  kind: CatalogKind;
  entry: CatalogEntryView;
  versions: VersionView[];
  tags: string[];
  reviews: { id: string; status: string; notes: string | null; createdAt: string }[];
  screenshotCount: number;
  notice?: { message: string; tone: 'success' | 'info' | 'error' } | null;
  error?: string | null;
}) {
  const kindLabel = kind === 'PLUGIN' ? 'Plugin' : 'Theme';
  const base = kind === 'PLUGIN' ? '/developer/plugins' : '/developer/themes';
  const Icon = kind === 'PLUGIN' ? PlugIcon : PaletteIcon;
  const actions = ACTIONS[kind];
  const canSubmit = canSubmitForReview(entry.status as never);
  const isPending = entry.status === 'PENDING_REVIEW';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={base}
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück zu {kindLabel}s
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${base}/${entry.slug}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            <PencilIcon className="h-4 w-4" />
            Bearbeiten
          </Link>

          {isPending ? (
            <form action={actions.withdraw}>
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="slug" value={entry.slug} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 px-3 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/10"
              >
                <ArchiveIcon className="h-4 w-4" />
                Einreichung zurückziehen
              </button>
            </form>
          ) : null}

          {canSubmit ? (
            <form action={actions.submit}>
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="slug" value={entry.slug} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                <CheckIcon className="h-4 w-4" />
                Zur Moderation einreichen
              </button>
            </form>
          ) : null}

          <DangerActionForm
            action={actions.remove}
            fields={{ id: entry.id, slug: entry.slug }}
            title={`${kindLabel} endgültig löschen?`}
            description={`„${entry.name}“ wird mit allen Versionen, Tags und Screenshots gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
            confirmLabel="Endgültig löschen"
          />
        </div>
      </div>

      {notice ? <Notice message={notice.message} tone={notice.tone} /> : null}
      {error ? <Notice message={error} tone="error" /> : null}

      <div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-violet-500/10 p-2 text-violet-400">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{entry.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <CatalogStatusBadge status={entry.status} />
              <span className="text-sm text-zinc-400">
                {entry.isPublished && entry.status === 'APPROVED'
                  ? 'Öffentlich sichtbar'
                  : 'Nicht öffentlich sichtbar'}
              </span>
            </div>
          </div>
        </div>

        {entry.status === 'CHANGES_REQUESTED' ? (
          <div className="mt-6 rounded-xl border border-orange-400/20 bg-orange-500/[0.06] p-4 text-sm text-orange-200">
            <p className="flex items-center gap-2 font-semibold">
              <AlertIcon className="h-4 w-4" />
              Änderungen angefordert
            </p>
            <p className="mt-1 text-orange-200/80">
              Lies das Moderationsfeedback unten, passe den Eintrag an und reiche ihn erneut ein.
            </p>
          </div>
        ) : null}

        {entry.status === 'DRAFT' ? (
          <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 text-sm text-zinc-300">
            <p className="flex items-center gap-2 font-semibold">
              <ClockIcon className="h-4 w-4" />
              Entwurf
            </p>
            <p className="mt-1 text-zinc-400">
              Dieser Eintrag ist nur für dich sichtbar. Füge mindestens eine Version hinzu und
              reiche ihn danach zur Moderation ein.
            </p>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs font-medium uppercase text-zinc-500">Slug</div>
            <code className="mt-0.5 font-mono text-sm text-zinc-300">{entry.slug}</code>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs font-medium uppercase text-zinc-500">Downloads</div>
            <div className="mt-0.5 text-sm font-bold text-emerald-400">{entry.downloads}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs font-medium uppercase text-zinc-500">Erstellt</div>
            <div className="mt-0.5 text-sm text-zinc-300">{entry.createdAt}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="text-xs font-medium uppercase text-zinc-500">Aktualisiert</div>
            <div className="mt-0.5 text-sm text-zinc-300">{entry.updatedAt}</div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Beschreibung</h2>
          <p className="whitespace-pre-line text-zinc-300">{entry.description}</p>
        </div>

        {tags.length > 0 ? (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-400">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {screenshotCount > 0 ? (
          <p className="mt-4 text-xs text-zinc-500">
            {screenshotCount} Screenshot{screenshotCount === 1 ? '' : 's'} hinterlegt.
          </p>
        ) : null}

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Versionen</h2>
            <Link
              href={`${base}/${entry.slug}/versions/create`}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              <PlusIcon className="h-4 w-4" />
              Neue Version
            </Link>
          </div>

          {versions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center">
              <p className="text-sm text-zinc-400">
                Noch keine Version hinterlegt. Für eine Einreichung ist mindestens eine Version
                erforderlich.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Versionen von {entry.name}</caption>
                <thead className="border-b border-zinc-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Version
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Hinweise
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Veröffentlicht
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Größe
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {versions.map((version) => (
                    <tr key={version.id}>
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-white">{version.version}</span>
                        {version.isLatest ? (
                          <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
                            Aktuell
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-zinc-300">
                        {version.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{version.releasedAt}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        {version.fileSize.toLocaleString('de-DE')} Bytes
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Während einer laufenden Prüfung können keine Versionen hinzugefügt werden.
          </p>
        </div>

        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-white">Moderationsfeedback</h2>
          {reviews.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
              Noch keine Moderationsentscheidung vorhanden.
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <CatalogStatusBadge status={review.status} />
                    <span className="text-xs text-zinc-500">{review.createdAt}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-zinc-300">
                    {review.notes || 'Keine Begründung hinterlegt.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
