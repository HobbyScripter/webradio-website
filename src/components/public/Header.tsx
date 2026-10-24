import Link from 'next/link';
import Brand from './Brand';
import MobileMenu from './MobileMenu';
import { ButtonLink } from '@/components/ui/button';
import { GitHubIcon } from '@/components/ui/icons';
import { REPOSITORY_URL } from '@/lib/site';

const NAV_ITEMS = [
  { label: 'Plugins', href: '/plugins' },
  { label: 'Themes', href: '/themes' },
  { label: 'Releases', href: '/releases' },
  { label: 'Dokumentation', href: '/docs' },
  { label: 'Neuigkeiten', href: '/news' },
] as const;

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#07070a]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[#07070a]/70">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7">
          <Brand />
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Quellcode auf GitHub (öffnet in einem neuen Tab)"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <GitHubIcon className="h-[18px] w-[18px]" />
          </a>
          <ButtonLink href="/developer" variant="ghost" size="sm">
            Entwickler
          </ButtonLink>
          <ButtonLink href="/auth/login" size="sm">
            Anmelden
          </ButtonLink>
        </div>

        <MobileMenu items={NAV_ITEMS} />
      </div>
    </header>
  );
}
