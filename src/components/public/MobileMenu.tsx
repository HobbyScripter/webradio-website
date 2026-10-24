'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { CloseIcon, GitHubIcon, MenuIcon } from '@/components/ui/icons';
import { REPOSITORY_URL } from '@/lib/site';

type NavItem = { label: string; href: string };

export default function MobileMenu({ items }: { items: readonly NavItem[] }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation"
        aria-label={menuOpen ? 'Navigation schließen' : 'Navigation öffnen'}
        className="rounded-lg p-2 text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>

      {menuOpen ? (
        <div
          id="mobile-navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-x-0 top-16 z-50 border-t border-white/[0.07] bg-[#07070a]/98 px-4 pb-6 pt-3 backdrop-blur-xl"
        >
          <nav aria-label="Mobile Hauptnavigation" className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4">
            <Link
              href="/developer"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              Entwicklerbereich
            </Link>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              <GitHubIcon className="h-4 w-4" />
              Quellcode auf GitHub
            </a>
            <ButtonLink href="/auth/login" className="mt-1 w-full">
              Anmelden
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
