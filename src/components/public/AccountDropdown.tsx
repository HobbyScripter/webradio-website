'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { ButtonLink } from '@/components/ui/button';
import {
  ChevronDownIcon,
  UserIcon,
  SettingsIcon,
  LogoutIcon,
  ShieldIcon,
  CodeIcon
} from '@/components/ui/icons';
import type { Role } from '@/lib/validations';

type AccountDropdownProps = {
  email: string;
  role: Role;
};

const ROLE_LABELS: Record<Role, string> = {
  USER: 'Benutzer',
  DEVELOPER: 'Entwickler',
  ADMIN: 'Administrator',
  SYSTEM_ADMIN: 'Systemadministrator',
};

const ROLE_COLORS: Record<Role, string> = {
  USER: 'text-zinc-300',
  DEVELOPER: 'text-violet-400',
  ADMIN: 'text-amber-400',
  SYSTEM_ADMIN: 'text-rose-400',
};

const ROLE_BG_COLORS: Record<Role, string> = {
  USER: 'bg-zinc-800',
  DEVELOPER: 'bg-violet-500/10',
  ADMIN: 'bg-amber-500/10',
  SYSTEM_ADMIN: 'bg-rose-500/10',
};

// Icons für Rollen
const ROLE_ICONS: Record<Role, React.ReactNode> = {
  USER: <UserIcon className="h-4 w-4" />,
  DEVELOPER: <CodeIcon className="h-4 w-4" />,
  ADMIN: <ShieldIcon className="h-4 w-4" />,
  SYSTEM_ADMIN: <ShieldIcon className="h-4 w-4" />,
};

export default function AccountDropdown({ email, role }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Schließe Dropdown bei Klick außerhalb
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Tastatursteuerung
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // Rollenabhängige Navigationslinks
  const getRoleLinks = () => {
    const links: { label: string; href: string; icon: React.ReactNode }[] = [];

    // Alle Benutzer
    links.push({ label: 'Mein Konto', href: '/account', icon: <UserIcon className="h-4 w-4" /> });
    links.push({ label: 'Profil', href: '/account/profile', icon: <SettingsIcon className="h-4 w-4" /> });
    links.push({ label: 'Sicherheit', href: '/account/security', icon: <ShieldIcon className="h-4 w-4" /> });

    // Entwickler und höher
    if (role === 'DEVELOPER' || role === 'ADMIN' || role === 'SYSTEM_ADMIN') {
      links.push({ label: 'Developer-Dashboard', href: '/developer', icon: <CodeIcon className="h-4 w-4" /> });
    }

    // Admin und höher
    if (role === 'ADMIN' || role === 'SYSTEM_ADMIN') {
      links.push({ label: 'Admin-Dashboard', href: '/admin', icon: <ShieldIcon className="h-4 w-4" /> });
    }

    // Nur SYSTEM_ADMIN
    if (role === 'SYSTEM_ADMIN') {
      links.push({ label: 'Systemverwaltung', href: '/system-admin', icon: <ShieldIcon className="h-4 w-4" /> });
    }

    return links;
  };

  const roleLinks = getRoleLinks();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Konto-Menü für ${email} öffnen`}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:border-white/[0.12] hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070a]"
      >
        <span className="flex items-center gap-1.5">
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${ROLE_BG_COLORS[role]}`}>
            {ROLE_ICONS[role]}
          </span>
          <span className="hidden sm:inline truncate max-w-[120px]">{email}</span>
        </span>
        <span className={`hidden sm:inline text-xs font-medium ${ROLE_COLORS[role]} px-1.5 py-0.5 rounded-md bg-opacity-20`}>
          {ROLE_LABELS[role]}
        </span>
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown-Menü */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Konto-Aktionen"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-white/[0.08] bg-[#07070a] shadow-2xl shadow-black/60 backdrop-blur-xl z-50 py-1.5"
        >
          <div className="px-3 py-2 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${ROLE_BG_COLORS[role]}`}>
                {ROLE_ICONS[role]}
              </span>
              <div>
                <div className="text-sm font-medium text-white truncate">{email}</div>
                <div className={`text-xs ${ROLE_COLORS[role]} font-medium`}>
                  {ROLE_LABELS[role]}
                </div>
              </div>
            </div>
          </div>

          <nav aria-label="Konto-Navigation" className="py-1">
            {roleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 focus-visible:ring-inset"
                role="menuitem"
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="border-t border-white/[0.05] pt-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/5 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400 focus-visible:ring-inset"
              role="menuitem"
            >
              <LogoutIcon className="h-4 w-4" />
              <span>Abmelden</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
