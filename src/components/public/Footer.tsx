import Link from 'next/link';
import Brand from './Brand';
import { Container } from '@/components/ui/layout';
import {
  REPOSITORY_DOCS_URL,
  REPOSITORY_ISSUES_URL,
  REPOSITORY_URL,
} from '@/lib/site';

const LINK_GROUPS = [
  {
    title: 'Produkt',
    links: [
      { label: 'Startseite', href: '/' },
      { label: 'Plugins', href: '/plugins' },
      { label: 'Themes', href: '/themes' },
      { label: 'Releases', href: '/releases' },
    ],
  },
  {
    title: 'Projekt',
    links: [
      { label: 'Dokumentation', href: '/docs' },
      { label: 'Neuigkeiten', href: '/news' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Entwicklerbereich', href: '/developer' },
    ],
  },
] as const;

const linkClass =
  'text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a] rounded';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#050507]">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
              Ein Open-Source-Projekt für ein erweiterbares Webradio-Ökosystem. Die Website
              befindet sich in einer frühen Entwicklungsphase.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Repository
              </a>
              <a
                href={REPOSITORY_ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Issues
              </a>
            </div>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Ressourcen
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a href={REPOSITORY_DOCS_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Technische Dokumentation
                </a>
              </li>
              <li>
                <Link href="/api/health" className={linkClass}>
                  Systemstatus
                </Link>
              </li>
              <li>
                <a href={`${REPOSITORY_URL}/blob/master/docs/SECURITY.md`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Sicherheitskonzept
                </a>
              </li>
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-zinc-500">
              Datenschutzerklärung und Impressum sind noch nicht veröffentlicht. Es werden keine
              Analyse- oder Marketing-Cookies eingesetzt.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/[0.07] pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 WebRadio-Projekt. Quellcode öffentlich auf GitHub.</p>
          <p className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            Entwicklungsstand: frühe Phase
          </p>
        </div>
      </Container>
    </footer>
  );
}
