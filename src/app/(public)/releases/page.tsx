export default function ReleasesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Releases & Downloads</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Offizielle Builds, Changelogs und Installationspakete für WebRadio.
        </p>
      </div>

      <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Latest
            </span>
            <h2 className="text-xl font-bold text-white">WebRadio v0.1.0-alpha</h2>
          </div>
          <span className="text-xs text-zinc-500 font-mono">Veröffentlicht: 2026-10-24</span>
        </div>

        <p className="text-zinc-300 text-sm leading-relaxed">
          Initiale Architektur- und Plattform-Basis mit Next.js 16, Prisma 8 RC, NextAuth.js und Tailwind CSS 4.
        </p>

        <div className="pt-2 flex flex-wrap gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            GitHub Release aufrufen &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
