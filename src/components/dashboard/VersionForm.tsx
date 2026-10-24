import Link from 'next/link';
import { CheckIcon } from '@/components/ui/icons';

/**
 * Version metadata form.
 *
 * The file itself is hosted elsewhere; the catalogue stores its URL, size and
 * checksum. All values are re-validated server-side by `pluginVersionSchema`.
 */
export default function VersionForm({
  action,
  kindLabel,
  entryId,
  slug,
  cancelHref,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  kindLabel: 'Plugin' | 'Theme';
  entryId: string;
  slug: string;
  cancelHref: string;
  error?: string | null;
}) {
  const inputClass =
    'w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none';
  const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-300';

  return (
    <form action={action} className="mt-8 space-y-6">
      <input type="hidden" name="id" value={entryId} />
      <input type="hidden" name="slug" value={slug} />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="version" className={labelClass}>
            Version (SemVer) <span className="text-rose-400">*</span>
          </label>
          <input
            id="version"
            name="version"
            placeholder="1.0.0"
            required
            pattern="^\d+\.\d+\.\d+$"
            title="Format: 1.0.0"
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <label htmlFor="fileSize" className={labelClass}>
            Dateigröße in Bytes <span className="text-rose-400">*</span>
          </label>
          <input
            id="fileSize"
            name="fileSize"
            type="number"
            min={1}
            step={1}
            required
            placeholder="204800"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="fileUrl" className={labelClass}>
          Download-URL <span className="text-rose-400">*</span>
        </label>
        <input
          id="fileUrl"
          name="fileUrl"
          type="url"
          required
          placeholder="https://example.com/mein-plugin-1.0.0.zip"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Nur öffentliche HTTPS-/HTTP-URLs. Dateien werden nicht auf dieser Website gespeichert.
        </p>
      </div>

      <div>
        <label htmlFor="checksum" className={labelClass}>
          Prüfsumme <span className="text-rose-400">*</span>
        </label>
        <input
          id="checksum"
          name="checksum"
          required
          maxLength={256}
          placeholder="sha256:…"
          className={`${inputClass} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Versionshinweise
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={1000}
          placeholder="Was ist neu in dieser Version?"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="minWebradioVersion" className={labelClass}>
            Mindest-WebRadio-Version
          </label>
          <input
            id="minWebradioVersion"
            name="minWebradioVersion"
            placeholder="1.0.0"
            pattern="^\d+\.\d+\.\d+$"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <label htmlFor="maxWebradioVersion" className={labelClass}>
            Höchst-WebRadio-Version
          </label>
          <input
            id="maxWebradioVersion"
            name="maxWebradioVersion"
            placeholder="2.0.0"
            pattern="^\d+\.\d+\.\d+$"
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Link
          href={cancelHref}
          className="px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
        >
          Abbrechen
        </Link>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <CheckIcon className="h-4 w-4" />
          Version für {kindLabel} speichern
        </button>
      </div>
    </form>
  );
}
