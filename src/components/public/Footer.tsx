import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 text-zinc-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Col 1 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wider uppercase mb-4">
              Ökosystem
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/plugins" className="hover:text-white transition-colors">
                  Plugin-Verzeichnis
                </Link>
              </li>
              <li>
                <Link href="/themes" className="hover:text-white transition-colors">
                  Themes & Skins
                </Link>
              </li>
              <li>
                <Link href="/releases" className="hover:text-white transition-colors">
                  Releases & Downloads
                </Link>
              </li>
              <li>
                <Link href="/roadmap" className="hover:text-white transition-colors">
                  Roadmap
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wider uppercase mb-4">
              Entwickler
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/developer" className="hover:text-white transition-colors">
                  Developer Portal
                </Link>
              </li>
              <li>
                <Link href="/docs/api" className="hover:text-white transition-colors">
                  API-Dokumentation
                </Link>
              </li>
              <li>
                <Link href="/developer/submit" className="hover:text-white transition-colors">
                  Plugin einreichen
                </Link>
              </li>
              <li>
                <Link href="/api/health" className="hover:text-white transition-colors">
                  System-Status
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wider uppercase mb-4">
              Community
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/news" className="hover:text-white transition-colors">
                  News & Blog
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  GitHub Repository
                </a>
              </li>
              <li>
                <Link href="/discord" className="hover:text-white transition-colors">
                  Discord Server
                </Link>
              </li>
              <li>
                <Link href="/forum" className="hover:text-white transition-colors">
                  Community-Forum
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wider uppercase mb-4">
              Rechtliches
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="/imprint" className="hover:text-white transition-colors">
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Nutzungsbedingungen
                </Link>
              </li>
              <li>
                <Link href="/security" className="hover:text-white transition-colors">
                  Sicherheit & Audit
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 WebRadio Community. Open Source unter MIT-Lizenz.</p>
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Plattform online
            </span>
            <span>Version 0.1.0 (Next.js 16 + Prisma 8)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
