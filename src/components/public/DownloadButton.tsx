'use client';

import { useSyncExternalStore } from 'react';
import { DownloadIcon } from '@/components/ui/icons';
import { formatFileSize } from '@/lib/format';

export type DownloadOption = {
  name: string;
  platform: string;
  platformLabel: string;
  downloadUrl: string;
  size: number;
};

type DetectedSystem = 'windows' | 'linux' | 'macos' | null;

function detectSystem(): DetectedSystem {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const source = `${navigator.userAgent} ${navigator.platform ?? ''}`.toLowerCase();
  if (source.includes('win')) {
    return 'windows';
  }
  if (source.includes('mac')) {
    return 'macos';
  }
  if (source.includes('linux') || source.includes('x11')) {
    return 'linux';
  }
  return null;
}

function subscribe(): () => void {
  // The detected system never changes while the page is open.
  return () => {};
}

/** Cached so `getSnapshot` returns a stable value on every call. */
let detection: { done: boolean; value: DetectedSystem } = { done: false, value: null };

function getSnapshot(): DetectedSystem {
  if (!detection.done) {
    detection = { done: true, value: detectSystem() };
  }
  return detection.value;
}

function getServerSnapshot(): DetectedSystem {
  // During SSR and hydration the server rendering is authoritative, so the
  // markup matches and the button still works without JavaScript.
  return null;
}

function pick(assets: DownloadOption[], system: DetectedSystem): DownloadOption | null {
  if (system === 'windows') {
    return assets.find((asset) => asset.platform === 'windows') ?? null;
  }
  if (system === 'macos') {
    return assets.find((asset) => asset.platform === 'macos') ?? null;
  }
  if (system === 'linux') {
    return (
      assets.find((asset) => asset.platform === 'linux') ??
      assets.find((asset) => asset.platform === 'arch') ??
      assets.find((asset) => asset.platform === 'debian') ??
      null
    );
  }
  return null;
}

/**
 * Primary download for the visitor's system.
 *
 * The server renders the first available package (Windows, when present), so the
 * button works without JavaScript. After mounting, the label and target follow
 * the detected operating system. "Andere Plattformen" always leads to the full
 * list, so a wrong guess is never a dead end.
 */
export default function DownloadButton({
  assets,
  version,
  otherPlatformsHref = '#downloads',
}: {
  assets: DownloadOption[];
  version: string;
  otherPlatformsHref?: string;
}) {
  const system = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const fallback = assets.find((asset) => asset.platform === 'windows') ?? assets[0] ?? null;
  const selected = (system ? pick(assets, system) : null) ?? fallback;

  if (!selected) {
    return (
      <a
        href={otherPlatformsHref}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <DownloadIcon className="h-4 w-4" /> Downloads ansehen
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        href={selected.downloadUrl}
        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070a]"
      >
        <DownloadIcon className="h-4 w-4" />
        Für {selected.platformLabel} herunterladen (v{version}, stabil)
      </a>
      <span className="text-xs text-zinc-500">
        {selected.name}
        {formatFileSize(selected.size) ? ` · ${formatFileSize(selected.size)}` : ''} ·{' '}
        <a href={otherPlatformsHref} className="underline-offset-4 hover:text-zinc-300 hover:underline">
          Andere Plattformen
        </a>
      </span>
    </div>
  );
}
