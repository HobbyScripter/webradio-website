/**
 * Cache tags for public content.
 *
 * Pure module (no `next/cache` import) so the tag names can be unit-tested and
 * reused by server actions, route handlers and tests without a Next runtime.
 *
 * Convention:
 *   `catalog`                 — every public catalogue read
 *   `catalog:plugin`          — every public read of one catalogue kind
 *   `catalog:plugin:<slug>`   — one detail page
 *   `legal`                   — every legal document read
 *   `legal:<TYPE>`            — one legal document type
 *
 * A mutation invalidates the broadest tag it can affect, so a cached detail
 * page is purged even when the action only knows the entry id.
 */

export type CatalogKind = 'PLUGIN' | 'THEME';

export const CACHE_TAGS = {
  catalog: 'catalog',
  catalogKind: (kind: CatalogKind): string => `catalog:${kind.toLowerCase()}`,
  catalogEntry: (kind: CatalogKind, slug: string): string =>
    `catalog:${kind.toLowerCase()}:${slug}`,
  legal: 'legal',
  legalType: (type: string): string => `legal:${type.toLowerCase()}`,
} as const;
