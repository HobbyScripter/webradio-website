export default function RoadmapPage() {
  const PHASES = [
    {
      phase: 'Phase 1',
      title: 'Projektvorbereitung & Architektur',
      status: 'Abgeschlossen',
      statusColor: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
      description: 'Architekturdefinition, Prisma 8 RC Integration, Sicherheitskonzept und Spezifikationen.',
    },
    {
      phase: 'Phase 2',
      title: 'Projektbasis & App-Struktur',
      status: 'Abgeschlossen',
      statusColor: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
      description: 'Bereinigung, Validierungsschemata, NextAuth Setup, Route-Groups, Layouts & Middleware.',
    },
    {
      phase: 'Phase 3',
      title: 'Authentifizierung & Datenbank-Anbindung',
      status: 'Geplant',
      statusColor: 'text-violet-400 border-violet-500/20 bg-violet-500/10',
      description: 'Prisma 8 Adapter für NextAuth, PostgreSQL-Datenbankmigration und rollenbasierter Zugriff.',
    },
    {
      phase: 'Phase 4',
      title: 'Plugin- & Theme-Katalog',
      status: 'Geplant',
      statusColor: 'text-zinc-400 border-zinc-700 bg-zinc-800',
      description: 'Verzeichnisanzeige, Upload-Pipeline für Zip-Pakete und Object-Storage-Integration.',
    },
    {
      phase: 'Phase 5',
      title: 'Community, Analytics & Production Readiness',
      status: 'Geplant',
      statusColor: 'text-zinc-400 border-zinc-700 bg-zinc-800',
      description: 'Releases, News, Monitoring und Go-Live Vorbereitung.',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Projekt-Roadmap</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Der strukturierte Phasenplan für die Entwicklung der WebRadio-Plattform.
        </p>
      </div>

      <div className="space-y-4">
        {PHASES.map((p) => (
          <div
            key={p.phase}
            className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-zinc-500 uppercase">
                  {p.phase}
                </span>
                <h2 className="text-lg font-bold text-white">{p.title}</h2>
              </div>
              <p className="text-sm text-zinc-400">{p.description}</p>
            </div>
            <div>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${p.statusColor}`}
              >
                {p.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
