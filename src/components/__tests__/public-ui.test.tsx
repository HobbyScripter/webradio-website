import Link from 'next/link';
import { fireEvent, render, screen } from '@testing-library/react';
import CatalogCard from '@/components/public/CatalogCard';
import MobileMenu from '@/components/public/MobileMenu';
import CatalogPagination from '@/components/public/CatalogPagination';
import { EmptyState, ErrorState } from '@/components/ui/states';

const item = {
  slug: 'alpha-plugin',
  name: 'Alpha Plugin',
  description: 'Eine Erweiterung für Playlists.',
  developerName: 'Studio Nord',
  tags: ['audio', 'playlist'],
  downloads: 12,
  latestVersion: '1.4.0',
  updatedAt: '2026-10-24T12:00:00.000Z',
};

describe('CatalogCard', () => {
  it('renders only real metadata and links to the detail page', () => {
    render(<CatalogCard item={item} kind="plugin" basePath="/plugins" />);

    const link = screen.getByRole('link', { name: /Alpha Plugin/ });
    expect(link).toHaveAttribute('href', '/plugins/alpha-plugin');
    expect(screen.getByText('von Studio Nord')).toBeInTheDocument();
    expect(screen.getByText('v1.4.0')).toBeInTheDocument();
    expect(screen.getByText('audio')).toBeInTheDocument();
    expect(screen.getByText('Stand 24. Oktober 2026')).toBeInTheDocument();
  });

  it('does not label a theme as a plugin', () => {
    render(<CatalogCard item={item} kind="theme" basePath="/themes" />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.queryByText('Plugin')).not.toBeInTheDocument();
  });
});

describe('MobileMenu', () => {
  const items = [
    { label: 'Plugins', href: '/plugins' },
    { label: 'Dokumentation', href: '/docs' },
  ];

  it('exposes an expanded state and closes with Escape', () => {
    render(<MobileMenu items={items} />);

    const toggle = screen.getByRole('button', { name: 'Navigation öffnen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Navigation schließen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('navigation', { name: 'Mobile Hauptnavigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plugins' })).toHaveAttribute('href', '/plugins');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Navigation öffnen' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('CatalogPagination', () => {
  it('renders previous and next links that preserve filters', () => {
    render(
      <CatalogPagination
        basePath="/plugins"
        query={{ q: 'radio', sort: 'name', page: 2 }}
        hasNext
      />,
    );

    expect(screen.getByRole('link', { name: /Zurück/ })).toHaveAttribute(
      'href',
      '/plugins?q=radio&sort=name',
    );
    expect(screen.getByRole('link', { name: /Weiter/ })).toHaveAttribute(
      'href',
      '/plugins?q=radio&sort=name&page=3',
    );
    expect(screen.getByText('Seite 2')).toBeInTheDocument();
  });

  it('renders nothing for a single page without a next page', () => {
    const { container } = render(
      <CatalogPagination basePath="/themes" query={{ q: '', sort: 'newest', page: 1 }} hasNext={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('empty and error states', () => {
  it('explains an empty search and offers a reset', () => {
    render(
      <EmptyState
        title="Keine Plugins gefunden"
        description="Versuche einen anderen Suchbegriff."
        tone="warning"
        action={<Link href="/plugins">Filter zurücksetzen</Link>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Keine Plugins gefunden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Filter zurücksetzen' })).toHaveAttribute(
      'href',
      '/plugins',
    );
  });

  it('announces a data error without exposing internals', () => {
    render(
      <ErrorState
        title="Katalog nicht erreichbar"
        description="Die Datenbank konnte nicht abgefragt werden."
        retryHref="/plugins"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Katalog nicht erreichbar');
    expect(alert).not.toHaveTextContent(/SQL|relation|password/i);
    expect(screen.getByRole('link', { name: 'Erneut versuchen' })).toHaveAttribute(
      'href',
      '/plugins',
    );
  });
});
