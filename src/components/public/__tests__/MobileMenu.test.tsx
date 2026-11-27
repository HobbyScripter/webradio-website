/**
 * @jest-environment jsdom
 *
 * Mobile navigation: custom links render in the given order, internal links
 * stay in the app, external links honour the stored "open in new tab" flag.
 */
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }));

jest.mock('@/i18n/navigation', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => '/',
}));

jest.mock('@/components/i18n/LanguageSelector', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'de',
    format: {},
    t: (key: string) =>
      ({
        'header.openMenu': 'Menü öffnen',
        'header.closeMenu': 'Menü schließen',
        'nav.mobileMain': 'Mobile Hauptnavigation',
        'nav.news': 'News',
        'header.sourceOnGithub': 'Quellcode auf GitHub',
        'developer.area': 'Entwicklerbereich',
        'header.login': 'Anmelden',
        'header.register': 'Registrieren',
        'header.accountNav': 'Kontonavigation',
        'header.signOut': 'Abmelden',
        'roles.user': 'Benutzer',
      })[key] ?? key,
  }),
}));

import { fireEvent, render, screen, within } from '@testing-library/react';
import MobileMenu from '../MobileMenu';

const ITEMS = [{ labelKey: 'nav.news', href: '/news' }];

const CUSTOM_LINKS = [
  { label: 'Intern', href: '/intern', external: false },
  { label: 'Extern neu', href: 'https://example.com', external: true, openInNewTab: true },
  { label: 'Extern gleich', href: 'https://example.org', external: true, openInNewTab: false },
];

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Menü öffnen' }));
  return screen.getByRole('navigation', { name: 'Mobile Hauptnavigation' });
}

describe('MobileMenu custom links', () => {
  it('renders built-in and custom links in order', () => {
    render(<MobileMenu items={ITEMS} customLinks={CUSTOM_LINKS} />);

    const nav = openMenu();
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);

    expect(labels).toEqual(['News', 'Intern', 'Extern neu', 'Extern gleich']);
  });

  it('keeps internal custom links inside the app', () => {
    render(<MobileMenu items={ITEMS} customLinks={CUSTOM_LINKS} />);

    const link = within(openMenu()).getByRole('link', { name: 'Intern' });
    expect(link).toHaveAttribute('href', '/intern');
    expect(link).not.toHaveAttribute('target');
  });

  it('opens external links in a new tab only when configured', () => {
    render(<MobileMenu items={ITEMS} customLinks={CUSTOM_LINKS} />);

    const nav = openMenu();
    const newTab = within(nav).getByRole('link', { name: 'Extern neu' });
    const sameTab = within(nav).getByRole('link', { name: 'Extern gleich' });

    expect(newTab).toHaveAttribute('href', 'https://example.com');
    expect(newTab).toHaveAttribute('target', '_blank');
    expect(newTab).toHaveAttribute('rel', 'noopener noreferrer');

    expect(sameTab).toHaveAttribute('href', 'https://example.org');
    expect(sameTab).not.toHaveAttribute('target');
  });

  it('renders no custom links when none are active', () => {
    render(<MobileMenu items={ITEMS} customLinks={[]} />);

    const nav = openMenu();
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['News']);
  });
});
