import Link from 'next/link';
import { ArrowLeftIcon, AlertIcon, CheckIcon } from '@/components/ui/icons';
import CatalogEntryForm from './CatalogEntryForm';
import CatalogStatusBadge from './CatalogStatusBadge';
import {
  createPluginAction,
  createThemeAction,
  updatePluginAction,
  updateThemeAction,
} from '@/app/(developer)/developer/actions';
import type { CatalogKind } from '@/lib/catalog-workflow';

/**
 * Create/edit surface shared by plugins and themes.
 * The page resolves the entry with an ownership filter before rendering this.
 */
export default function CatalogEntryEditor({
  kind,
  mode,
  initial,
  status,
  error,
  success,
}: {
  kind: CatalogKind;
  mode: 'create' | 'edit';
  initial?: {
    id: string;
    slug: string;
    name: string;
    description: string;
    repositoryUrl?: string | null;
  };
  status?: string;
  error?: string | null;
  success?: string | null;
}) {
  const kindLabel = kind === 'PLUGIN' ? 'Plugin' : 'Theme';
  const base = kind === 'PLUGIN' ? '/developer/plugins' : '/developer/themes';

  const action =
    kind === 'PLUGIN'
      ? mode === 'create'
        ? createPluginAction
        : updatePluginAction
      : mode === 'create'
        ? createThemeAction
        : updateThemeAction;

  const requiresReReview = status === 'APPROVED';

  return (
    <div className="space-y-8">
      <Link
        href={mode === 'edit' && initial ? `${base}/${initial.slug}` : base}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück
      </Link>

      <div className="max-w-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {mode === 'create' ? `Neues ${kindLabel} erstellen` : `${kindLabel} bearbeiten`}
          </h1>
          {status ? <CatalogStatusBadge status={status} /> : null}
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          {mode === 'create'
            ? `Erstelle ein ${kindLabel} für WebRadio. Speichere es als Entwurf oder reiche es direkt zur Moderation ein.`
            : `Änderungen werden geprüft. Ein bereits genehmigter Eintrag muss erneut moderiert werden.`}
        </p>

        {success ? (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200"
          >
            <CheckIcon className="h-4 w-4" />
            {success}
          </p>
        ) : null}

        {requiresReReview ? (
          <p className="mt-6 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            Dieser Eintrag ist genehmigt. Beim Speichern wird er aus dem öffentlichen Katalog
            genommen und erneut zur Moderation eingereicht.
          </p>
        ) : null}

        <CatalogEntryForm
          action={action}
          mode={mode}
          kindLabel={kindLabel}
          initial={
            initial
              ? {
                  slug: initial.slug,
                  name: initial.name,
                  description: initial.description,
                  repositoryUrl: initial.repositoryUrl ?? null,
                }
              : undefined
          }
          entryId={initial?.id}
          cancelHref={mode === 'edit' && initial ? `${base}/${initial.slug}` : base}
          error={error}
        />
      </div>
    </div>
  );
}
