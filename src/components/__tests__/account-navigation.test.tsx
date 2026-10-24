/**
 * Signed-in navigation behaviour for the desktop account dropdown and the
 * mobile account section. Rendered with the real components; only the NextAuth
 * `signOut` call is mocked.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';

jest.mock('next-auth/react', () => ({
  signOut: jest.fn(() => Promise.resolve(undefined)),
}));

import { signOut } from 'next-auth/react';
import AccountDropdown from '@/components/public/AccountDropdown';
import MobileMenu from '@/components/public/MobileMenu';
import type { Role } from '@/lib/validations';

const NAV_ITEMS = [
  { label: 'Plugins', href: '/plugins' },
  { label: 'Releases', href: '/releases' },
];

const mockSignOut = jest.mocked(signOut);

beforeEach(() => {
  jest.clearAllMocks();
});

function openAccountMenu(email = 'user@webradio.test', role: Role = 'USER') {
  render(<AccountDropdown email={email} role={role} />);
  const trigger = screen.getByRole('button', { name: `Konto-Menü für ${email} öffnen` });
  fireEvent.click(trigger);
  return { trigger, menu: screen.getByRole('menu', { name: 'Konto-Aktionen' }) };
}

describe('AccountDropdown', () => {
  it('replaces the sign-in link with account entries for USER', () => {
    const { menu } = openAccountMenu();

    expect(screen.queryByText('Anmelden')).not.toBeInTheDocument();
    const accountNav = within(menu).getByRole('navigation', { name: 'Konto-Navigation' });

    expect(within(accountNav).getByRole('menuitem', { name: 'Mein Konto' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(within(accountNav).getByRole('menuitem', { name: 'Profil' })).toHaveAttribute(
      'href',
      '/account/profile',
    );
    expect(within(accountNav).getByRole('menuitem', { name: 'Sicherheit' })).toHaveAttribute(
      'href',
      '/account/security',
    );
    expect(
      within(accountNav).queryByRole('menuitem', { name: 'Developer-Dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      within(accountNav).queryByRole('menuitem', { name: 'Admin-Dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      within(accountNav).queryByRole('menuitem', { name: 'Systemverwaltung' }),
    ).not.toBeInTheDocument();
  });

  it('adds the developer dashboard for DEVELOPER and keeps admin hidden', () => {
    const { menu } = openAccountMenu('dev@webradio.test', 'DEVELOPER');
    const accountNav = within(menu).getByRole('navigation', { name: 'Konto-Navigation' });

    expect(
      within(accountNav).getByRole('menuitem', { name: 'Developer-Dashboard' }),
    ).toHaveAttribute('href', '/developer');
    expect(
      within(accountNav).queryByRole('menuitem', { name: 'Admin-Dashboard' }),
    ).not.toBeInTheDocument();
  });

  it('adds the admin dashboard for ADMIN and keeps system administration hidden', () => {
    const { menu } = openAccountMenu('admin@webradio.test', 'ADMIN');
    const accountNav = within(menu).getByRole('navigation', { name: 'Konto-Navigation' });

    expect(within(accountNav).getByRole('menuitem', { name: 'Admin-Dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(
      within(accountNav).queryByRole('menuitem', { name: 'Systemverwaltung' }),
    ).not.toBeInTheDocument();
  });

  it('gives SYSTEM_ADMIN the system administration entry as well', () => {
    const { menu } = openAccountMenu('root@webradio.test', 'SYSTEM_ADMIN');
    const accountNav = within(menu).getByRole('navigation', { name: 'Konto-Navigation' });

    expect(
      within(accountNav).getByRole('menuitem', { name: 'Developer-Dashboard' }),
    ).toBeInTheDocument();
    expect(within(accountNav).getByRole('menuitem', { name: 'Admin-Dashboard' })).toBeInTheDocument();
    expect(
      within(accountNav).getByRole('menuitem', { name: 'Systemverwaltung' }),
    ).toHaveAttribute('href', '/system-admin');
  });

  it('exposes menu semantics, closes on Escape and returns focus', () => {
    const { trigger } = openAccountMenu();

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('opens with ArrowDown and focuses the first item', () => {
    render(<AccountDropdown email="user@webradio.test" role="USER" />);
    const trigger = screen.getByRole('button', { name: /Konto-Menü/ });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        expect(document.activeElement).toBe(
          screen.getByRole('menuitem', { name: 'Mein Konto' }),
        );
        resolve();
      }, 0);
    });
  });

  it('signs out through NextAuth', async () => {
    const { menu } = openAccountMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Abmelden' }));

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });
});

describe('MobileMenu while signed in', () => {
  it('shows the account section and no Anmelden action', () => {
    render(
      <MobileMenu
        items={NAV_ITEMS}
        isAuthenticated
        userEmail="dev@webradio.test"
        userRole="DEVELOPER"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Navigation öffnen' }));

    expect(screen.queryByRole('link', { name: 'Anmelden' })).not.toBeInTheDocument();
    expect(screen.queryByText('Registrieren')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Entwicklerbereich' })).not.toBeInTheDocument();

    const accountToggle = screen.getByRole('button', { name: /dev@webradio.test/ });
    expect(accountToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(accountToggle);
    expect(accountToggle).toHaveAttribute('aria-expanded', 'true');

    const accountNav = screen.getByRole('navigation', { name: 'Konto-Navigation' });
    expect(within(accountNav).getByRole('link', { name: 'Developer-Dashboard' })).toHaveAttribute(
      'href',
      '/developer',
    );
    expect(within(accountNav).getByRole('link', { name: 'Mein Konto' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(within(accountNav).queryByRole('link', { name: 'Admin-Dashboard' })).not.toBeInTheDocument();
    expect(within(accountNav).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });

  it('keeps sign-in and registration for anonymous visitors', () => {
    render(<MobileMenu items={NAV_ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Navigation öffnen' }));

    expect(screen.getByRole('link', { name: 'Anmelden' })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByRole('link', { name: 'Registrieren' })).toHaveAttribute(
      'href',
      '/auth/register',
    );
    expect(screen.getByRole('link', { name: 'Entwicklerbereich' })).toHaveAttribute(
      'href',
      '/developer',
    );
    expect(screen.queryByRole('navigation', { name: 'Konto-Navigation' })).not.toBeInTheDocument();
  });

  it('signs out from the mobile account section', async () => {
    render(<MobileMenu items={NAV_ITEMS} isAuthenticated userEmail="user@webradio.test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Navigation öffnen' }));
    fireEvent.click(screen.getByRole('button', { name: /user@webradio.test/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });
});
