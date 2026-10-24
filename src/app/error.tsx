'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client-side error for observability
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-3xl font-mono font-bold shadow-lg shadow-rose-500/5">
          !
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Ein Fehler ist aufgetreten
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Die Übertragung wurde unerwartet unterbrochen. Details wurden zur Analyse erfasst.
        </p>
        {error?.digest && (
          <p className="font-mono text-xs text-zinc-500 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/80">
            Fehler-ID: {error.digest}
          </p>
        )}
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-all duration-200 shadow-md shadow-rose-600/25 active:scale-[0.98]"
          >
            Erneut versuchen
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-all duration-200 active:scale-[0.98]"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
