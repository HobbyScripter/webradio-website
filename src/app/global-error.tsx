'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h2 className="text-2xl font-bold">Kritischer Systemfehler</h2>
          <p className="text-zinc-400 text-sm">
            Ein unerwarteter Fehler im Hauptlayout ist aufgetreten.
          </p>
          {error?.digest && (
            <p className="font-mono text-xs text-zinc-500">ID: {error.digest}</p>
          )}
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-semibold transition-colors"
          >
            Neu laden
          </button>
          <nav
            aria-label="Rechtliches"
            className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-zinc-500"
          >
            <Link href="/impressum" className="hover:text-zinc-300">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:text-zinc-300">
              Datenschutz
            </Link>
          </nav>
        </div>
      </body>
    </html>
  );
}
