import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400 text-3xl font-mono font-bold shadow-lg shadow-violet-500/5">
          404
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Seite nicht gefunden
        </h1>
        <p className="text-zinc-400 text-base leading-relaxed">
          Die angeforderte Station oder Seite existiert nicht oder wurde auf eine andere Frequenz verschoben.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-all duration-200 shadow-md shadow-violet-600/25 active:scale-[0.98]"
          >
            Zur Startseite
          </Link>
          <Link
            href="/plugins"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-all duration-200 active:scale-[0.98]"
          >
            Plugins entdecken
          </Link>
        </div>
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
    </div>
  );
}
