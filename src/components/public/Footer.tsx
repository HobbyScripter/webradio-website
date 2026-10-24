import Link from 'next/link';
import Brand from './Brand';
import { Container } from '@/components/ui/layout';
import {
  PRODUCT_CONTRIBUTING_URL,
  PRODUCT_DISCUSSIONS_URL,
  PRODUCT_DOCS_URL,
  PRODUCT_ISSUES_URL,
  PRODUCT_LICENSE_URL,
  PRODUCT_PLUGIN_SDK_URL,
  PRODUCT_PRIVACY_URL,
  PRODUCT_RELEASES_URL,
  PRODUCT_REPOSITORY_URL,
  PRODUCT_SECURITY_URL,
  PRODUCT_THEME_SDK_URL,
  WEBSITE_REPOSITORY_URL,
} from '@/lib/site';

const LINK_GROUPS = [
  {
    title: 'Produkt',
    links: [
      { label: 'Startseite', href: '/' },
      { label: 'Releases & Downloads', href: '/releases' },
      { label: 'Plugins', href: '/plugins' },
      { label: 'Themes', href: '/themes' },
    ],
  },
  {
    title: 'Dokumentation',
    links: [
      { label: 'Projektübersicht', href: '/docs' },
      { label: 'Offizielle Docs', href: PRODUCT_DOCS_URL, external: true },
      { label: 'Plugin SDK', href: PRODUCT_PLUGIN_SDK_URL, external: true },
      { label: 'Theme SDK', href: PRODUCT_THEME_SDK_URL, external: true },
    ],
  },
  {
    title: 'Projekt',
    links: [
      { label: 'Quellcode', href: PRODUCT_REPOSITORY_URL, external: true },
      { label: 'Alle Releases', href: PRODUCT_RELEASES_URL, external: true },
      { label: 'Issues', href: PRODUCT_ISSUES_URL, external: true },
      { label: 'Discussions', href: PRODUCT_DISCUSSIONS_URL, external: true },
      { label: 'Sicherheit', href: PRODUCT_SECURITY_URL, external: true },
      { label: 'Lizenz (Apache-2.0)', href: PRODUCT_LICENSE_URL, external: true },
    ],
  },
] as const;

const linkClass =
  'text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a] rounded';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#050507]">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
              Quelloffener Internetradio-Player für Windows und Linux. Weltweite Sendersuche,
              native Audiopipeline, Plugins und Themes – entwickelt von Your Elite Systems.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={PRODUCT_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Downloads
              </a>
              <a
                href={PRODUCT_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Dokumentation
              </a>
              <a
                href={PRODUCT_CONTRIBUTING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Mitmachen
              </a>
            </div>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) =>
                  'external' in link && link.external ? (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.href}>
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 space-y-3 border-t border-white/[0.07] pt-6 text-xs leading-relaxed text-zinc-500">
          <p>
            Release-Daten und Download-Links stammen direkt aus dem offiziellen GitHub-Repository.
            Plugins und Themes in diesem Katalog sind ausschließlich für WebRadio bestimmt.
          </p>
          <p>
            Datenschutzerklärung und Impressum dieser Website sind noch nicht veröffentlicht. Es
            werden keine Analyse- oder Marketing-Cookies eingesetzt. Die Datenschutzhinweise des
            Desktop-Programms stehen in der{' '}
            <a
              href={PRODUCT_PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              Projektdokumentation
            </a>
            .{' '}
            <a
              href={WEBSITE_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              Website-Quellcode
            </a>
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-white/[0.07] pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Your Elite Systems · WebRadio steht unter Apache-2.0.</p>
          <p className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Offizielle Projekt- und Release-Daten von GitHub
          </p>
        </div>
      </Container>
    </footer>
  );
}
