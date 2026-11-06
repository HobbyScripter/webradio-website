/**
 * Cached public reads.
 *
 * The pages stay dynamic (`connection()` / `io()`), but the database reads behind
 * them are cached with `use cache`, so two requests within the lifetime do not
 * hit PostgreSQL again. Every cached read is tagged (see `cache-tags.ts`); a
 * mutation calls the matching helper in `revalidate.ts` and the next request
 * reads fresh data.
 *
 * Lifetimes are deliberately short. Tags make changes visible immediately; the
 * lifetime only bounds how stale an untouched entry may become.
 */
import { cacheLife, cacheTag } from 'next/cache';
import { CACHE_TAGS } from './cache-tags';
import {
  getPublishedPluginBySlug,
  getPublishedThemeBySlug,
  listPublishedPlugins,
  listPublishedThemes,
  type PluginDetail,
  type PluginSummary,
  type ThemeDetail,
  type ThemeSummary,
} from './catalog';
import type { CatalogSort } from './catalog-query';
import { getPublishedLegalDocument, type LegalDocumentType, type LegalDocumentVersion } from './legal-document-service';

export type CatalogListInput = {
  q: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
};

export type CatalogListResult<T> = { items: T[]; hasNext: boolean };

export async function getCachedLegalDocument(
  type: LegalDocumentType,
): Promise<LegalDocumentVersion | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CACHE_TAGS.legal, CACHE_TAGS.legalType(type));
  return getPublishedLegalDocument(type);
}

export async function listCachedPlugins(
  input: CatalogListInput,
): Promise<CatalogListResult<PluginSummary>> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CACHE_TAGS.catalog, CACHE_TAGS.catalogKind('PLUGIN'));
  return listPublishedPlugins(input);
}

export async function listCachedThemes(
  input: CatalogListInput,
): Promise<CatalogListResult<ThemeSummary>> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CACHE_TAGS.catalog, CACHE_TAGS.catalogKind('THEME'));
  return listPublishedThemes(input);
}

export async function getCachedPluginBySlug(slug: string): Promise<PluginDetail | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(
    CACHE_TAGS.catalog,
    CACHE_TAGS.catalogKind('PLUGIN'),
    CACHE_TAGS.catalogEntry('PLUGIN', slug),
  );
  return getPublishedPluginBySlug(slug);
}

export async function getCachedThemeBySlug(slug: string): Promise<ThemeDetail | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(
    CACHE_TAGS.catalog,
    CACHE_TAGS.catalogKind('THEME'),
    CACHE_TAGS.catalogEntry('THEME', slug),
  );
  return getPublishedThemeBySlug(slug);
}
