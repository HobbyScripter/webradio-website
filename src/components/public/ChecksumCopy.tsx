'use client';

import { useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';

/**
 * Checksum display with a copy button.
 *
 * The hash wraps on small screens (`break-all`) instead of forcing the whole
 * detail column to scroll horizontally. The verification hint stays one line and
 * names both commands, so a visitor doesn't need to look them up.
 */
export default function ChecksumCopy({
  checksum,
  label = 'SHA-256',
}: {
  checksum: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(checksum);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the value stays selectable by hand.
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/30 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          aria-label="Prüfsumme kopieren"
        >
          {copied ? <CheckIcon className="h-3 w-3" /> : null}
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <code className="mt-1 block break-all font-mono text-[10px] leading-4 text-zinc-400">
        {checksum}
      </code>
      <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">
        Prüfen: <code className="font-mono">sha256sum datei</code> (Linux) oder{' '}
        <code className="font-mono">certutil -hashfile datei SHA256</code> (Windows).
      </p>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Prüfsumme kopiert' : ''}
      </span>
    </div>
  );
}
