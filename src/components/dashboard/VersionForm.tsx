'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';

type ReleaseAsset = {
  name: string;
  size: number;
  downloadUrl: string;
  digest: string | null;
  contentType: string | null;
};

type Release = {
  id: number;
  tagName: string;
  version: string | null;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  isPrerelease: boolean;
  notes: string;
  assets: ReleaseAsset[];
};

type LookupResponse = {
  repository?: { fullName: string; url: string };
  releases?: Release[];
  stale?: boolean;
  message?: string;
};

const inputClass =
  'w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 transition-colors focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-300';

function formatBytes(bytes: number): string {
  return `${new Intl.NumberFormat('de-DE').format(bytes)} Bytes`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

/**
 * Version metadata form for plugins and themes.
 *
 * Two ways to fill it:
 *
 *   1. Manually — the previous behaviour, always available.
 *   2. From the repository's GitHub releases — the server lists published
 *      releases, the developer picks one, and tag, notes, download URL, size
 *      and (when GitHub provides it) the sha256 digest are copied into the
 *      form. Nothing is submitted or published by loading the list; the values
 *      remain editable and are still validated server-side.
 */
export default function VersionForm({
  action,
  kindLabel,
  entryId,
  slug,
  cancelHref,
  error,
  repositoryUrl,
}: {
  action: (formData: FormData) => void | Promise<void>;
  kindLabel: 'Plugin' | 'Theme';
  entryId: string;
  slug: string;
  cancelHref: string;
  error?: string | null;
  /** Stored repository link; prefills the GitHub mode of this form. */
  repositoryUrl?: string | null;
}) {
  const [source, setSource] = useState<'manual' | 'github'>(
    repositoryUrl ? 'github' : 'manual',
  );

  const [repositoryInput, setRepositoryInput] = useState(repositoryUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [repositoryName, setRepositoryName] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [version, setVersion] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [checksum, setChecksum] = useState('');
  const [description, setDescription] = useState('');

  async function loadReleases() {
    setLoading(true);
    setLookupError(null);
    setHint(null);
    setReleases([]);
    setRepositoryName(null);
    setSelectedReleaseId(null);
    setStale(false);

    try {
      const response = await fetch(
        `/api/developer/github/releases?url=${encodeURIComponent(repositoryInput)}`,
        { headers: { Accept: 'application/json' } },
      );
      const body = (await response.json().catch(() => null)) as LookupResponse | null;

      if (!response.ok || !body) {
        setLookupError(
          body?.message ??
            'Die Releases konnten nicht geladen werden. Bitte trage die Version manuell ein.',
        );
        return;
      }

      const loaded = body.releases ?? [];
      setReleases(loaded);
      setRepositoryName(body.repository?.fullName ?? null);
      setStale(Boolean(body.stale));

      if (loaded.length === 0) {
        setHint(
          'Dieses Repository hat keine veröffentlichten Releases. Du kannst die Version weiterhin manuell eintragen.',
        );
      }
    } catch {
      setLookupError(
        'GitHub ist nicht erreichbar. Bitte trage die Version manuell ein.',
      );
    } finally {
      setLoading(false);
    }
  }

  function applyRelease(release: Release, assetName?: string) {
    const asset =
      release.assets.find((candidate) => candidate.name === assetName) ??
      release.assets[0] ??
      null;

    setSelectedReleaseId(release.id);

    if (release.version) {
      setVersion(release.version);
    }
    setFileUrl(asset?.downloadUrl ?? release.htmlUrl);
    setFileSize(asset ? String(asset.size) : '');
    setChecksum(asset?.digest ?? '');
    setDescription(release.notes.slice(0, 1000));

    setHint(
      asset
        ? asset.digest
          ? null
          : 'Dieses Release liefert keine Prüfsumme. Bitte ergänze sie manuell, bevor du einreichst.'
        : 'Für dieses Release sind keine Download-Dateien hinterlegt. Ergänze Download-URL, Dateigröße und Prüfsumme manuell.',
    );
  }

  const selectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? null;

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

      <fieldset className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <legend className="px-1 text-sm font-medium text-zinc-300">Versionsquelle</legend>
        <p className="text-xs leading-relaxed text-zinc-500">
          Du kannst die Versionsdaten selbst eintragen oder aus den GitHub-Releases deines
          Repositorys übernehmen. Das Laden der Releases veröffentlicht nichts – die Auswahl wird
          erst mit dem Absenden eingereicht und wie gewohnt geprüft.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              source === 'manual'
                ? 'border-violet-500/60 bg-violet-500/10 text-white'
                : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            <input
              type="radio"
              name="versionSource"
              value="manual"
              checked={source === 'manual'}
              onChange={() => setSource('manual')}
              className="h-4 w-4 accent-violet-500"
            />
            Manuell eintragen
          </label>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              source === 'github'
                ? 'border-violet-500/60 bg-violet-500/10 text-white'
                : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            <input
              type="radio"
              name="versionSource"
              value="github"
              checked={source === 'github'}
              onChange={() => setSource('github')}
              className="h-4 w-4 accent-violet-500"
            />
            Aus GitHub-Releases übernehmen
          </label>
        </div>

        {source === 'github' ? (
          <div className="mt-5 space-y-4 border-t border-white/[0.07] pt-4">
            <div>
              <label htmlFor="repositoryUrl" className={labelClass}>
                GitHub-Repository
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="repositoryUrl"
                  name="repositoryUrl"
                  type="text"
                  inputMode="url"
                  placeholder="https://github.com/OWNER/REPOSITORY"
                  value={repositoryInput}
                  onChange={(event) => setRepositoryInput(event.target.value)}
                  className={`${inputClass} font-mono text-sm`}
                />
                <button
                  type="button"
                  onClick={() => void loadReleases()}
                  disabled={loading || repositoryInput.trim() === ''}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Lade Releases …' : 'Releases laden'}
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Es genügt die Adresse des Repositorys. Zusätzliche Pfade wie <code>/tree/main</code>{' '}
                oder <code>/releases</code> werden automatisch entfernt.
              </p>
            </div>

            {lookupError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100"
              >
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {lookupError}
              </p>
            ) : null}

            {repositoryName ? (
              <p className="text-xs text-zinc-400">
                Releases von <span className="font-mono text-zinc-200">{repositoryName}</span>
                {stale ? ' (zwischengespeicherter Stand, GitHub war nicht erreichbar)' : ''}
              </p>
            ) : null}

            {hint ? (
              <p className="text-xs leading-relaxed text-amber-200/80">{hint}</p>
            ) : null}

            {releases.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-300">Release auswählen</p>
                <ul className="space-y-2">
                  {releases.map((release) => (
                    <li key={release.id}>
                      <label
                        className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 text-sm transition-colors ${
                          selectedReleaseId === release.id
                            ? 'border-violet-500/60 bg-violet-500/[0.08]'
                            : 'border-zinc-800 hover:bg-zinc-800/40'
                        }`}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <input
                            type="radio"
                            name="selectedRelease"
                            value={release.tagName}
                            checked={selectedReleaseId === release.id}
                            onChange={() => applyRelease(release)}
                            className="h-4 w-4 accent-violet-500"
                          />
                          <span className="font-mono text-zinc-100">{release.tagName}</span>
                          <span className="text-zinc-300">{release.name}</span>
                          {release.isPrerelease ? (
                            <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                              Pre-Release
                            </span>
                          ) : null}
                        </span>
                        <span className="pl-6 text-xs text-zinc-500">
                          {formatDate(release.publishedAt)} ·{' '}
                          {release.assets.length === 1
                            ? '1 Download-Datei'
                            : `${release.assets.length} Download-Dateien`}
                          {release.version ? '' : ' · Tag ist keine SemVer-Version, bitte manuell prüfen'}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                {selectedRelease && selectedRelease.assets.length > 1 ? (
                  <div className="mt-4">
                    <label htmlFor="releaseAsset" className={labelClass}>
                      Download-Datei
                    </label>
                    <select
                      id="releaseAsset"
                      value={
                        selectedRelease.assets.find((asset) => asset.downloadUrl === fileUrl)?.name ??
                        selectedRelease.assets[0]?.name ??
                        ''
                      }
                      onChange={(event) => applyRelease(selectedRelease, event.target.value)}
                      className={inputClass}
                    >
                      {selectedRelease.assets.map((asset) => (
                        <option key={asset.name} value={asset.name}>
                          {asset.name} ({formatBytes(asset.size)})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </fieldset>

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
            value={version}
            onChange={(event) => setVersion(event.target.value)}
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
            value={fileSize}
            onChange={(event) => setFileSize(event.target.value)}
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
          value={fileUrl}
          onChange={(event) => setFileUrl(event.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Nur öffentliche HTTPS-/HTTP-URLs. Dateien werden nicht auf dieser Website gespeichert.
          GitHub-Repository- und Release-Links werden auf ihre kanonische Adresse gekürzt.
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
          value={checksum}
          onChange={(event) => setChecksum(event.target.value)}
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Wird bei GitHub-Releases automatisch übernommen, wenn GitHub einen SHA-256-Digest liefert.
        </p>
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
          value={description}
          onChange={(event) => setDescription(event.target.value)}
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
