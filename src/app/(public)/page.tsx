import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Glow Accents */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-violet-600/20 via-indigo-500/15 to-fuchsia-500/10 blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute top-[600px] -right-40 w-[500px] h-[400px] bg-gradient-to-br from-cyan-500/10 via-indigo-600/10 to-transparent blur-[140px] rounded-full" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-20 md:pt-32 md:pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Release / Phase Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-8 hover:bg-violet-500/15 transition-all">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span>WebRadio Platform v0.1 • Next.js 16 + Prisma 8 Architektur</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.1]">
          Die modulare Schaltzentrale für{' '}
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-fuchsia-400 bg-clip-text text-transparent">
            dein modernes WebRadio
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Entdecke verifizierte Plugins, maßgeschneiderte Themes und die neuesten Releases.
          Entwickelt für Streamer, Sender und leidenschaftliche Audio-Macher.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/plugins"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all duration-200 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 active:scale-[0.98]"
          >
            Plugins durchstöbern
            <svg
              className="ml-2 w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>

          <Link
            href="/developer"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-zinc-300 bg-zinc-900/90 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all duration-200 active:scale-[0.98]"
          >
            Entwickler-Portal
          </Link>
        </div>

        {/* Metrics Banner */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm max-w-4xl mx-auto">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">100%</div>
            <div className="text-xs text-zinc-400 mt-1">Open Source (MIT)</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-violet-400">&lt; 50ms</div>
            <div className="text-xs text-zinc-400 mt-1">Streaming-Latenz</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400">Prisma 8</div>
            <div className="text-xs text-zinc-400 mt-1">Contract-Based ORM</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">24/7</div>
            <div className="text-xs text-zinc-400 mt-1">Ausfallsichere Architektur</div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-zinc-900">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-3">
            Plattform-Features
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white">
            Alles für deine Rundfunk-Infrastruktur
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="group p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-violet-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/5 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959A4.5 4.5 0 007.5 4.5a4.5 4.5 0 00-2.84 8.01 4.5 4.5 0 006.59 2.016m3-8.439v5.922m0 0a3 3 0 106 0v-5.922" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Erweiterbares Plugin-System</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Automatisiere Playlisten, füge Audio-DSP-Effekte hinzu oder integriere eigene Metadaten-Feeds via standardisierter Plugin-APIs.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/60">
              <Link href="/plugins" className="text-xs font-semibold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
                Katalog erkunden &rarr;
              </Link>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Dynamische Themes</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Passe das WebRadio-Erscheinungsbild mit vorgefertigten oder maßgeschneiderten Themes an deine Sender-Identität an.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/60">
              <Link href="/themes" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
                Themes ansehen &rarr;
              </Link>
            </div>
          </div>

          {/* Card 3 */}
          <div className="group p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 hover:border-fuchsia-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-fuchsia-500/5 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-fuchsia-600/10 border border-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Sichere Release-Pipeline</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Signierte Pakete, automatisierte Integritätsprüfungen via SHA-256 und saubere SemVer-Releases direkt über GitHub Releases.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-800/60">
              <Link href="/releases" className="text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300 inline-flex items-center gap-1">
                Aktuelle Builds &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
