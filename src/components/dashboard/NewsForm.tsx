import Link from 'next/link';
import { CheckIcon } from '@/components/ui/icons';

/** Plain-text article editor. Content is rendered as text, never as HTML. */
export default function NewsForm({
  action,
  mode,
  initial,
  cancelHref,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: 'create' | 'edit';
  initial?: {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    content: string;
  };
  cancelHref: string;
  error?: string | null;
}) {
  const inputClass =
    'w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-rose-400 focus:outline-none';
  const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-300';

  return (
    <form action={action} className="mt-6 space-y-5">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="title" className={labelClass}>
          Titel <span className="text-rose-400">*</span>
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={initial?.title}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="slug" className={labelClass}>
          Slug <span className="text-rose-400">*</span>
        </label>
        <input
          id="slug"
          name="slug"
          required
          maxLength={64}
          pattern="^[a-z0-9-]+$"
          title="Nur Kleinbuchstaben, Zahlen und Bindestriche"
          defaultValue={initial?.slug}
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-xs text-zinc-500">Bestimmt die öffentliche URL /news/&lt;slug&gt;.</p>
      </div>

      <div>
        <label htmlFor="summary" className={labelClass}>
          Zusammenfassung
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={2}
          maxLength={500}
          defaultValue={initial?.summary ?? ''}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <label htmlFor="content" className={labelClass}>
          Inhalt <span className="text-rose-400">*</span>
        </label>
        <textarea
          id="content"
          name="content"
          required
          minLength={10}
          rows={14}
          defaultValue={initial?.content}
          className={`${inputClass} resize-y`}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Reiner Text. Zeilenumbrüche werden übernommen; HTML wird nicht ausgeführt.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Link
          href={cancelHref}
          className="px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          Abbrechen
        </Link>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <CheckIcon className="h-4 w-4" />
          {mode === 'create' ? 'Artikel als Entwurf anlegen' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  );
}
