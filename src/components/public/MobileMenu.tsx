'use client';

import Link from '@/i18n/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { ButtonLink } from '@/components/ui/button';
import LanguageSelector from '@/components/i18n/LanguageSelector';
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
  ChevronRightIcon,
} from '@/components/ui/icons';
import { PRODUCT_REPOSITORY_URL } from '@/lib/site';
import { getAccountNavItems, ROLE_LABEL_KEYS, type AccountNavIcon } from '@/lib/roles';
import type { Role } from '@/lib/validations';
import { useI18n } from '@/i18n/provider';
import type { Locale } from '@/i18n/config';

type NavItem = {
  labelKey?: string;
  label?: string;
  href: string;
  custom?: boolean;
  external?: boolean;
  openInNewTab?: boolean;
};

type MobileMenuProps = {
  items: readonly NavItem[];
  customLinks?: readonly NavItem[];
  isAuthenticated?: boolean;
  userEmail?: string;
  userRole?: Role;
  /** Kept for layout parity; the menu itself translates through the provider. */
  locale?: Locale;
};

const ROLE_COLORS: Record<Role, string> = {
  USER: 'text-zinc-400',
  DEVELOPER: 'text-violet-400',
  ADMIN: 'text-amber-400',
  SYSTEM_ADMIN: 'text-rose-400',
};

export default function MobileMenu({
  items,
  customLinks = [],
  isAuthenticated = false,
  userEmail = '',
  userRole = 'USER',
}: MobileMenuProps) {
  const { t } = useI18n();
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
        aria-label={menuOpen ? t('header.closeMenu') : t('header.openMenu')}
        className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
      </button>

      {menuOpen && (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 top-16 z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/[0.07] bg-[#07070a]/98 px-4 pb-6 pt-3 backdrop-blur-xl"
        >
          {/* Main navigation */}
          <nav aria-label={t('nav.mobileMain')} className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {item.labelKey ? t(item.labelKey) : item.label}
              </Link>
            ))}
            {customLinks?.map((link) => (
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target={link.openInNewTab ? '_blank' : undefined}
                  rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  {link.label ?? (link.labelKey ? t(link.labelKey) : '') }
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  {link.label ?? (link.labelKey ? t(link.labelKey) : '') }
                </Link>
              )
            ))}
          </nav>

          {/* Language */}
          <div className="mt-4 border-t border-white/[0.07] pt-4">
            <LanguageSelector variant="footer" />
          </div>

          {/* External links */}
          <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4">
            <a
              href={PRODUCT_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              <GitHubIcon className="h-4 w-4" />
              {t('header.sourceOnGithub')}
            </a>

            {/* Developer link (signed-out visitors only) */}
            {!isAuthenticated && (
              <Link
                href="/developer"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {t('developer.area')}
              </Link>
            )}

            {/* Account section for signed-in users */}
            {isAuthenticated && (
              <div className="mt-2 border-t border-white/[0.07] pt-2">
                <button
                  type="button"
                  onClick={() => setAccountOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                  aria-expanded={accountOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{userEmail}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-medium ${ROLE_COLORS[userRole]}`}>
                    {t(ROLE_LABEL_KEYS[userRole])}
                  </span>
                  <ChevronRightIcon
                    className={`h-4 w-4 shrink-0 transition-transform ${accountOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                {accountOpen && (
                  <nav aria-label={t('header.accountNav')} className="ml-4 mt-1 space-y-1">
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
                        {t(link.labelKey)}
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/5 hover:text-rose-200"
                    >
                      <LogoutIcon className="h-4 w-4" />
                      {t('header.signOut')}
                    </button>
                  </nav>
                )}
              </div>
            )}

            {/* Sign in / register for signed-out visitors */}
            {!isAuthenticated && (
              <>
                <ButtonLink
                  href="/auth/login"
                  size="md"
                  className="w-full"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('header.login')}
                </ButtonLink>
                <Link
                  href="/auth/register"
                  className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('header.register')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
