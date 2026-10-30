'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckIcon, PlusIcon } from '@/components/ui/icons';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 64);
}

/**
 * Shared create/edit form for plugins and themes.
 *
 * Slug generation only runs while the developer has not typed into the slug
 * field themselves, so an explicit slug is never overwritten.
 */
export default function CatalogEntryForm({
  action,
  mode,
  kindLabel,
  initial,
  entryId,
  cancelHref,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: 'create' | 'edit';
  kindLabel: 'Plugin' | 'Theme';
  initial?: { slug: string; name: string; description: string; repositoryUrl?: string | null };
  entryId?: string;
  cancelHref: string;
  error?: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');

  return (
    <form action={action} className="mt-8 space-y-6">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-zinc-300">
            {kindLabel}-Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder={`Mein ${kindLabel}`}
            required
            maxLength={100}
            autoFocus={mode === 'create'}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) {
                setSlug(generateSlug(event.target.value));
              }
            }}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-zinc-300">
            {kindLabel}-Slug <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            id="slug"
            name="slug"
            placeholder={`mein-${kindLabel.toLowerCase()}`}
            required
            maxLength={64}
            pattern="^[a-z0-9-]+$"
            title="Nur Kleinbuchstaben, Zahlen und Bindestriche"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 font-mono text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Nur Kleinbuchstaben, Zahlen und Bindestriche. Der Slug bestimmt die öffentliche URL.
          </p>
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Beschreibung <span className="text-rose-400">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            placeholder={`Beschreibe dein ${kindLabel}...`}
            required
            minLength={10}
            maxLength={2000}
            rows={7}
            defaultValue={initial?.description ?? ''}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Mindestens 10 Zeichen, maximal 2000 Zeichen.
          </p>
        </div>

        {kindLabel === 'Plugin' ? (
          <div>
            <label htmlFor="repositoryUrl" className="mb-1.5 block text-sm font-medium text-zinc-300">
              GitHub-Repository <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              id="repositoryUrl"
              name="repositoryUrl"
              inputMode="url"
              maxLength={300}
              placeholder="https://github.com/OWNER/REPOSITORY"
              defaultValue={initial?.repositoryUrl ?? ''}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 font-mono text-sm text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Es genügt die Adresse des Repositorys. Zusatzpfade wie{' '}
              <code>/tree/main</code> werden entfernt. Mit dieser Angabe werden neue Versionen
              vorausgefüllt; veröffentlicht wird dadurch nichts.
            </p>
          </div>
        ) : null}

        <input type="hidden" name="product" value="WEBRADIO" />
        {entryId ? <input type="hidden" name="id" value={entryId} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <Link
          href={cancelHref}
          className="px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          Abbrechen
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'create' ? (
            <button
              type="submit"
              name="intent"
              value="draft"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Als Entwurf speichern
            </button>
          ) : null}
          <button
            type="submit"
            name="intent"
            value={mode === 'create' ? 'submit' : 'save'}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {mode === 'create' ? (
              <>
                <PlusIcon className="h-4 w-4" />
                {kindLabel} einreichen
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4" />
                Änderungen speichern
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
