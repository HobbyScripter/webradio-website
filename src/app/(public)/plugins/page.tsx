import Link from 'next/link';

export default function PluginsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Plugin-Verzeichnis</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Erweitere dein WebRadio um Playlisten-Automation, DSP-Effekte und Webhook-Benachrichtigungen.
          </p>
        </div>
        <Link
          href="/developer"
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-sm"
        >
          Plugin veröffentlichen
        </Link>
      </div>

      {/* Filter / Search Bar */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Nach Plugins suchen (z.B. Icecast, AutoDJ, Equalizer)..."
          className="flex-1 px-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
        />
        <select className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-violet-500">
          <option value="all">Alle Kategorien</option>
          <option value="audio">Audio / DSP</option>
          <option value="automation">Automation</option>
          <option value="streaming">Streaming-Server</option>
          <option value="integration">Integrationen</option>
        </select>
      </div>

      {/* Empty State */}
      <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
        <div className="w-12 h-12 rounded-xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-white">Katalog wird in Phase 4 mit Live-Daten befüllt</h3>
        <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1">
          Die Datenbank-Anbindung und das Plugin-Management werden in den nächsten Phasen freigeschaltet.
        </p>
      </div>
    </div>
  );
}
