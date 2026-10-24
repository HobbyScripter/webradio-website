export default function NewsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Neuigkeiten & Blog</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Aktuelle Entwicklungen, Community-Updates und Release-Notes.
        </p>
      </div>

      <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
        <span className="text-xs text-violet-400 font-semibold uppercase">Ankündigung</span>
        <h2 className="text-xl font-bold text-white">
          Neustart des WebRadio-Ökosystems mit moderner Next.js 16 Architektur
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Das Projekt wurde vollständig neu aufgesetzt – mit Prisma 8 Contract Schema, verbesserter Sicherheit und einem modularen Plugin-Store.
        </p>
        <div className="text-xs text-zinc-500 pt-2">24. Oktober 2026 • WebRadio Kern-Team</div>
      </div>
    </div>
  );
}
