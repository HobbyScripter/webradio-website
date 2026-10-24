import type { Metadata } from 'next';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Entwicklerbereich',
  robots: { index: false, follow: false },
};

export default function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Developer Portal
            </span>
            <span className="text-xs text-zinc-400">Verwalte deine Plugins, Themes & API-Keys</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/developer"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Übersicht
            </Link>
            <Link
              href="/docs#entwickler"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              Einreichung dokumentieren
            </Link>
          </div>
        </div>
      </div>
      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}
