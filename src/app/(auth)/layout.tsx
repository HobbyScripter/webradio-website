import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Konto',
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="min-h-dvh flex flex-col justify-center items-center px-4 py-12 bg-[#07070a] relative overflow-hidden">
      {/* Background Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[500px] bg-gradient-to-tr from-violet-600/15 via-indigo-600/10 to-transparent blur-[140px] rounded-full" />
      
      {/* Brand Header */}
      <div className="mb-8 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:scale-105 transition-all">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">WebRadio</span>
        </Link>
      </div>

      {/* Main Auth Container */}
      <div className="w-full max-w-md relative z-10">{children}</div>

      {/* Back Link */}
      <div className="mt-8 text-center text-xs text-zinc-500 relative z-10">
        <Link href="/" className="hover:text-zinc-300 transition-colors">
          &larr; Zurück zur Startseite
        </Link>
      </div>

      {/* Legal pages stay reachable without an account */}
      <nav
        aria-label="Rechtliches"
        className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500 relative z-10"
      >
        <Link href="/impressum" className="hover:text-zinc-300 transition-colors">
          Impressum
        </Link>
        <Link href="/datenschutz" className="hover:text-zinc-300 transition-colors">
          Datenschutz
        </Link>
      </nav>
    </main>
  );
}
