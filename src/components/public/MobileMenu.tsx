'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { ButtonLink } from '@/components/ui/button';
import {
  CloseIcon,
  GitHubIcon,
  MenuIcon,
  UserIcon,
  SettingsIcon,
  LogoutIcon,
  ShieldIcon,
  CodeIcon,
  ServerIcon,
  ChevronRightIcon
} from '@/components/ui/icons';
import { PRODUCT_REPOSITORY_URL } from '@/lib/site';
import { getAccountNavItems, ROLE_LABELS, type AccountNavIcon } from '@/lib/roles';
import type { Role } from '@/lib/validations';

type NavItem = { label: string; href: string };

type MobileMenuProps = {
  items: readonly NavItem[];
  isAuthenticated?: boolean;
  userEmail?: string;
  userRole?: Role;
};

const ROLE_COLORS: Record<Role, string> = {
  USER: 'text-zinc-400',
  DEVELOPER: 'text-violet-400',
  ADMIN: 'text-amber-400',
  SYSTEM_ADMIN: 'text-rose-400',
};

export default function MobileMenu({ 
  items, 
  isAuthenticated = false, 
  userEmail = '', 
  userRole = 'USER' 
}: MobileMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setAccountOpen(false);
        // Return focus to the button that opened the panel instead of the body.
        toggleRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  function NavIcon({ name }: { name: AccountNavIcon }) {
    switch (name) {
      case 'settings':
        return <SettingsIcon className="h-4 w-4" />;
      case 'shield':
        return <ShieldIcon className="h-4 w-4" />;
      case 'code':
        return <CodeIcon className="h-4 w-4" />;
      case 'server':
        return <ServerIcon className="h-4 w-4" />;
      default:
        return <UserIcon className="h-4 w-4" />;
    }
  }

  // Role-dependent links come from the shared account navigation table.
  const accountLinks = getAccountNavItems(userRole);

  return (
    <div className="md:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => {
          setAccountOpen(false);
          setMenuOpen((value) => !value);
        }}
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation"
        aria-label={menuOpen ? 'Navigation schließen' : 'Navigation öffnen'}
        className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>

      {menuOpen && (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 top-16 z-50 border-t border-white/[0.07] bg-[#07070a]/98 px-4 pb-6 pt-3 backdrop-blur-xl"
        >
          {/* Hauptnavigation */}
          <nav aria-label="Mobile Hauptnavigation" className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Externe Links */}
          <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4">
            <a
              href={PRODUCT_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              <GitHubIcon className="h-4 w-4" />
              Quellcode auf GitHub
            </a>

            {/* Entwickler-Link (nur für nicht angemeldete Benutzer) */}
            {!isAuthenticated && (
              <Link
                href="/developer"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                Entwicklerbereich
              </Link>
            )}

            {/* Account-Bereich für angemeldete Benutzer */}
            {isAuthenticated && (
              <div className="border-t border-white/[0.07] pt-2 mt-2">
                <button
                  type="button"
                  onClick={() => setAccountOpen((prev) => !prev)}
                  className="flex items-center justify-between w-full rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white text-left"
                  aria-expanded={accountOpen}
                >
                  <span className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    {userEmail}
                  </span>
                  <span className={`text-xs ${ROLE_COLORS[userRole]} font-medium`}>
                    {ROLE_LABELS[userRole]}
                  </span>
                  <ChevronRightIcon className={`h-4 w-4 transition-transform ${accountOpen ? 'rotate-90' : ''}`} />
                </button>

                {accountOpen && (
                  <nav aria-label="Konto-Navigation" className="ml-4 mt-1 space-y-1">
                    {accountLinks.map((link) => (
                      <Link
                        key={link.key}
                        href={link.href}
                        onClick={() => {
                          setMenuOpen(false);
                          setAccountOpen(false);
                        }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                      >
                        <NavIcon name={link.icon} />
                        {link.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/5 hover:text-rose-200 w-full text-left"
                    >
                      <LogoutIcon className="h-4 w-4" />
                      Abmelden
                    </button>
                  </nav>
                )}
              </div>
            )}

            {/* Anmelden/Registrieren für nicht angemeldete Benutzer */}
            {!isAuthenticated && (
              <>
                <ButtonLink
                  href="/auth/login"
                  size="md"
                  className="w-full"
                  onClick={() => setMenuOpen(false)}
                >
                  Anmelden
                </ButtonLink>
                <Link
                  href="/auth/register"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white text-center"
                  onClick={() => setMenuOpen(false)}
                >
                  Registrieren
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
