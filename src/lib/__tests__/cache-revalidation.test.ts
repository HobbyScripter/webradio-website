/**
 * @jest-environment node
 *
 * Cache wiring for public content: tag names, invalidation calls and the tags a
 * cached read attaches. The cache runtime itself (Next) is mocked; these tests
 * prove that every mutation purges the reads that depend on it.
 */
jest.mock('next/cache', () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/catalog', () => ({
  listPublishedPlugins: jest.fn(async () => ({ items: [], hasNext: false })),
  listPublishedThemes: jest.fn(async () => ({ items: [], hasNext: false })),
  getPublishedPluginBySlug: jest.fn(async () => null),
  getPublishedThemeBySlug: jest.fn(async () => null),
}));

jest.mock('@/lib/legal-document-service', () => ({
  getPublishedLegalDocument: jest.fn(async () => null),
}));

import { cacheTag } from 'next/cache';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '../cache-tags';
import { LEGAL_PAGE_LABELS, LEGAL_PAGE_NAVIGATION, LEGAL_PAGE_PATHS, TERMS_LABEL } from '../legal-labels';
import { revalidateCatalogue, revalidateLegalDocument } from '../revalidate';
import {
  getCachedLegalDocument,
  getCachedPluginBySlug,
  listCachedPlugins,
  listCachedThemes,
} from '../cached-content';

const mockTag = jest.mocked(revalidateTag);
const mockPath = jest.mocked(revalidatePath);
const mockCacheTag = jest.mocked(cacheTag);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cache tag names', () => {
  it('uses lowercase, stable tags per kind and entry', () => {
    expect(CACHE_TAGS.catalog).toBe('catalog');
    expect(CACHE_TAGS.catalogKind('PLUGIN')).toBe('catalog:plugin');
    expect(CACHE_TAGS.catalogKind('THEME')).toBe('catalog:theme');
    expect(CACHE_TAGS.catalogEntry('PLUGIN', 'mediahub')).toBe('catalog:plugin:mediahub');
    expect(CACHE_TAGS.legalType('DATENSCHUTZ')).toBe('legal:datenschutz');
  });
});

describe('catalogue invalidation', () => {
  it('purges list, detail and homepage for one kind', () => {
    revalidateCatalogue('THEME', 'snip3r-carbon');

    expect(mockTag).toHaveBeenCalledWith('catalog', 'max');
    expect(mockTag).toHaveBeenCalledWith('catalog:theme', 'max');
    expect(mockTag).toHaveBeenCalledWith('catalog:theme:snip3r-carbon', 'max');
    expect(mockPath).toHaveBeenCalledWith('/themes');
    expect(mockPath).toHaveBeenCalledWith('/themes/snip3r-carbon');
    expect(mockPath).toHaveBeenCalledWith('/');
    expect(mockPath).not.toHaveBeenCalledWith('/plugins');
  });

  it('purges both kinds when the affected kind is unknown', () => {
    revalidateCatalogue();

    expect(mockTag).toHaveBeenCalledWith('catalog:plugin', 'max');
    expect(mockTag).toHaveBeenCalledWith('catalog:theme', 'max');
    expect(mockPath).toHaveBeenCalledWith('/plugins');
    expect(mockPath).toHaveBeenCalledWith('/themes');
    expect(mockPath).toHaveBeenCalledWith('/');
  });
});

describe('legal invalidation', () => {
  it('purges the document tag, its page and the homepage footer', () => {
    revalidateLegalDocument('NUTZUNGSBEDINGUNGEN');

    expect(mockTag).toHaveBeenCalledWith('legal', 'max');
    expect(mockTag).toHaveBeenCalledWith('legal:nutzungsbedingungen', 'max');
    expect(mockPath).toHaveBeenCalledWith('/nutzungsbedingungen');
    expect(mockPath).toHaveBeenCalledWith('/');
  });

  it('does not guess a path for an unknown document type', () => {
    revalidateLegalDocument('UNKNOWN');

    expect(mockTag).toHaveBeenCalledWith('legal:unknown', 'max');
    expect(mockPath).not.toHaveBeenCalledWith('/impressum');
  });
});

describe('cached reads carry tags', () => {
  it('tags the catalogue lists per kind', async () => {
    await listCachedPlugins({ q: '', sort: 'newest', page: 1, pageSize: 12 });
    expect(mockCacheTag).toHaveBeenCalledWith('catalog', 'catalog:plugin');

    jest.clearAllMocks();
    await listCachedThemes({ q: '', sort: 'newest', page: 1, pageSize: 12 });
    expect(mockCacheTag).toHaveBeenCalledWith('catalog', 'catalog:theme');
  });

  it('tags a detail read with its kind and slug', async () => {
    await getCachedPluginBySlug('mediahub');
    expect(mockCacheTag).toHaveBeenCalledWith(
      'catalog',
      'catalog:plugin',
      'catalog:plugin:mediahub',
    );
  });

  it('tags a legal read with the document type', async () => {
    await getCachedLegalDocument('DATENSCHUTZ');
    expect(mockCacheTag).toHaveBeenCalledWith('legal', 'legal:datenschutz');
  });
});

describe('legal labels', () => {
  it('is the single source for the terms label', () => {
    expect(TERMS_LABEL).toBe('Nutzungsbedingungen');
    expect(LEGAL_PAGE_LABELS.NUTZUNGSBEDINGUNGEN).toBe(TERMS_LABEL);
    expect(LEGAL_PAGE_PATHS.NUTZUNGSBEDINGUNGEN).toBe('/nutzungsbedingungen');
    expect(LEGAL_PAGE_NAVIGATION.map((entry) => entry.label)).toEqual([
      'Impressum',
      'Datenschutz',
      TERMS_LABEL,
    ]);
  });
});
