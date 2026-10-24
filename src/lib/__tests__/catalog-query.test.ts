import {
  PAGE_SIZE,
  buildCatalogHref,
  hasNextPage,
  pageOffset,
  parseCatalogQuery,
} from '../catalog-query';

describe('parseCatalogQuery', () => {
  it('falls back to safe defaults for missing or invalid values', () => {
    expect(parseCatalogQuery({})).toEqual({ q: '', sort: 'newest', page: 1 });
    expect(parseCatalogQuery({ q: ['a'], sort: 'invalid', page: '0' })).toEqual({
      q: '',
      sort: 'newest',
      page: 1,
    });
    expect(parseCatalogQuery({ page: '9999' }).page).toBe(1);
  });

  it('parses valid values, trims the search term and uses the first array entry', () => {
    expect(
      parseCatalogQuery({ q: '  radio  ', sort: 'downloads', page: '3' }),
    ).toEqual({ q: 'radio', sort: 'downloads', page: 3 });

    expect(parseCatalogQuery({ q: ['alpha', 'beta'] }).q).toBe('alpha');
  });

  it('rejects search terms longer than 80 characters', () => {
    expect(parseCatalogQuery({ q: 'x'.repeat(81) })).toEqual({
      q: '',
      sort: 'newest',
      page: 1,
    });
  });
});

describe('catalogue pagination helpers', () => {
  it('computes offsets and detects a next page from one extra row', () => {
    expect(PAGE_SIZE).toBe(9);
    expect(pageOffset(1)).toBe(0);
    expect(pageOffset(3)).toBe(18);
    expect(hasNextPage(PAGE_SIZE)).toBe(false);
    expect(hasNextPage(PAGE_SIZE + 1)).toBe(true);
  });
});

describe('buildCatalogHref', () => {
  it('omits default values and preserves search and sort', () => {
    expect(buildCatalogHref('/plugins', { q: '', sort: 'newest' })).toBe('/plugins');
    expect(buildCatalogHref('/plugins', { q: 'radio', sort: 'name' })).toBe(
      '/plugins?q=radio&sort=name',
    );
  });

  it('adds a page override and encodes the query', () => {
    const href = buildCatalogHref(
      '/themes',
      { q: 'dark mode', sort: 'newest' },
      { page: 2 },
    );

    expect(href).toBe('/themes?q=dark+mode&page=2');
  });

  it('allows resetting to the first page', () => {
    expect(
      buildCatalogHref('/plugins', { q: 'x', sort: 'newest' }, { page: 1 }),
    ).toBe('/plugins?q=x');
  });
});
