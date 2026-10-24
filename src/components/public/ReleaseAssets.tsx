import { DownloadIcon, PackageIcon } from '@/components/ui/icons';
import type { GitHubAsset } from '@/lib/github';
import { formatFileSize } from '@/lib/format';

/**
 * Download buttons are rendered exclusively from `GitHubAsset` entries that
 * passed URL and artifact validation in `src/lib/github.ts`. An empty list
 * never falls back to a guessed filename or constructed URL.
 */
export default function ReleaseAssets({
  assets,
  releaseUrl,
}: {
  assets: GitHubAsset[];
  releaseUrl: string;
}) {
  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.015] p-4 text-sm leading-relaxed text-zinc-400">
        <p className="flex items-start gap-2">
          <PackageIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <span>
            Für dieses Release sind keine Installationsdateien hinterlegt. Es werden deshalb keine
            Download-Schaltflächen erzeugt.{' '}
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline underline-offset-4 hover:text-white"
            >
              Release auf GitHub öffnen
            </a>
          </span>
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {assets.map((asset) => (
        <li
          key={asset.name}
          className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                {asset.platformLabel}
              </span>
              <span className="text-[11px] text-zinc-500">{asset.format}</span>
            </div>
            <p className="mt-2 truncate font-mono text-[11px] text-zinc-400" title={asset.name}>
              {asset.name}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatFileSize(asset.size) ?? 'Größe unbekannt'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href={asset.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${asset.platformLabel}: ${asset.name} herunterladen`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070a]"
            >
              <DownloadIcon className="h-3.5 w-3.5" /> Download
            </a>

            {asset.digest ? (
              <details className="min-w-0 text-[11px] text-zinc-500">
                <summary className="cursor-pointer rounded text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  SHA-256
                </summary>
                <code className="mt-1 block break-all font-mono text-[10px] leading-4 text-zinc-400">
                  {asset.digest}
                </code>
              </details>
            ) : (
              <span className="text-[11px] text-zinc-600">Kein Prüfsummen-Digest</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
