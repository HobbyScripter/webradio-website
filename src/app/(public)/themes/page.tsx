export default function ThemesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Themes & Skins</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Passe das Design deines WebRadio-Players und der Weboberfläche an.
        </p>
      </div>

      <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/10 text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-white">Theme-Ökosystem in Vorbereitung</h3>
        <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1">
          Kuratierte und von der Community entwickelte Themes werden mit Phase 4 gelistet.
        </p>
      </div>
    </div>
  );
}
