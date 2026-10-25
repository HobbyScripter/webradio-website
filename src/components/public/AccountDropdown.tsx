'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  ChevronDownIcon,
  UserIcon,
  SettingsIcon,
  LogoutIcon,
  ShieldIcon,
  CodeIcon,
  ServerIcon,
} from '@/components/ui/icons';
import { getAccountNavItems, ROLE_LABELS, type AccountNavIcon } from '@/lib/roles';
import type { Role } from '@/lib/validations';

type AccountDropdownProps = {
  email: string;
  role: Role;
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
    case 'logout':
      return <LogoutIcon className="h-4 w-4" />;
    case 'user':
    default:
      return <UserIcon className="h-4 w-4" />;
  }
}

export default function AccountDropdown({ email, role }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Roving tabindex: exactly one menu item is tabbable, so Tab from the trigger
  // reaches the menu instead of skipping it.
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const links = getAccountNavItems(role);

  const focusableItems = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      ),
    [],
  );

  const focusItem = useCallback(
    (index: number) => {
      const items = focusableItems();
      if (items.length === 0) {
        return;
      }
      const normalised = ((index % items.length) + items.length) % items.length;
      setActiveIndex(normalised);
      items[normalised]?.focus();
    },
    [focusableItems],
  );

  const close = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  /**
   * Open the menu and move focus to one item, as the ARIA menu-button pattern
   * expects. Called from event handlers (never from an effect), so the state
   * update stays out of the render/effect cascade.
   */
  const openMenu = useCallback(
    (index = 0) => {
      setActiveIndex(index >= 0 ? index : -1);
      setIsOpen(true);
      window.setTimeout(() => focusItem(index), 0);
    },
    [focusItem],
  );

  // Click outside closes the menu without stealing focus.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // Escape closes from anywhere; arrows and Home/End move focus within the menu.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      }

      const items = focusableItems();
      if (items.length === 0) {
        return;
      }

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItem(currentIndex < 0 ? 0 : currentIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItem(currentIndex < 0 ? items.length - 1 : currentIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusItem(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusItem(items.length - 1);
      }
      // Tab keeps its native behaviour; leaving the container closes the menu.
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close, focusItem, focusableItems]);

  const handleLogout = async () => {
    // Full navigation after the session is revoked, so every server component
    // (header included) renders the signed-out state immediately.
    await signOut({ callbackUrl: '/' });
  };

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        // Focus leaving the trigger/menu pair closes the popup (Tab out).
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openMenu(0))}
        onKeyDown={(event) => {
          // Arrow keys open the menu with the first/last item focused.
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openMenu(0);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu(-1);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`Konto-Menü für ${email} öffnen`}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:border-white/[0.12] hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070a]"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-md ${ROLE_BG_COLORS[role]}`}
          >
            <UserIcon className="h-4 w-4" />
          </span>
          <span className="hidden max-w-[120px] truncate lg:inline">{email}</span>
        </span>
        <span
          className={`hidden rounded-md px-1.5 py-0.5 text-xs font-medium lg:inline ${ROLE_COLORS[role]}`}
        >
          {ROLE_LABELS[role]}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Konto-Aktionen"
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-white/[0.08] bg-[#07070a] py-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="border-b border-white/[0.05] px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-md ${ROLE_BG_COLORS[role]}`}
              >
                <UserIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{email}</div>
                <div className={`text-xs font-medium ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </div>
              </div>
            </div>
          </div>

          <nav aria-label="Konto-Navigation" className="py-1">
            {links.map((link, index) => (
              <Link
                key={link.key}
                href={link.href}
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                onClick={() => close()}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:bg-white/[0.06] focus-visible:text-white focus-visible:outline-none"
              >
                <NavIcon name={link.icon} />
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="border-t border-white/[0.05] pt-1">
            <button
              type="button"
              role="menuitem"
              tabIndex={links.length === activeIndex ? 0 : -1}
              onFocus={() => setActiveIndex(links.length)}
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/5 hover:text-rose-200 focus-visible:bg-rose-500/10 focus-visible:text-rose-100 focus-visible:outline-none"
            >
              <NavIcon name="logout" />
              <span>Abmelden</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
