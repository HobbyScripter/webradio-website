/**
 * Invalidation for public content after a mutation.
 *
 * Two mechanisms are combined on purpose:
 *
 *   - **Tags** purge every cached read that is tagged (list, detail, homepage
 *     preview) without the caller having to know slugs or pages. `revalidateTag`
 *     works in server actions and in route handlers, which is why it is used
 *     instead of `updateTag` (Server-Action only).
 *   - **Paths** refresh the rendered route, so the next request cannot be served
 *     from a route-level cache entry that was produced before the mutation.
 *
 * Both are cheap: tags only mark entries stale, and paths only affect the routes
 * named here. No extra database query is triggered by this module.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAGS, type CatalogKind } from './cache-tags';

const CATALOG_LIST_PATH: Record<CatalogKind, string> = {
  PLUGIN: '/plugins',
  THEME: '/themes',
};

const LEGAL_PATH: Record<string, string> = {
  IMPRESSUM: '/impressum',
  DATENSCHUTZ: '/datenschutz',
  NUTZUNGSBEDINGUNGEN: '/nutzungsbedingungen',
};

/**
 * Public catalogue content changed: approval, rejection, removal, withdrawal,
 * resubmission, new version or a deletion. The homepage preview and both list
 * pages read the same data, so they are revalidated together.
 */
export function revalidateCatalogue(
  kind?: CatalogKind | null,
  slug?: string | null,
): void {
  revalidateTag(CACHE_TAGS.catalog, 'max');
  if (kind) {
    revalidateTag(CACHE_TAGS.catalogKind(kind), 'max');
    if (slug) {
      revalidateTag(CACHE_TAGS.catalogEntry(kind, slug), 'max');
    }
    revalidatePath(CATALOG_LIST_PATH[kind]);
  } else {
    revalidateTag(CACHE_TAGS.catalogKind('PLUGIN'), 'max');
    revalidateTag(CACHE_TAGS.catalogKind('THEME'), 'max');
    revalidatePath(CATALOG_LIST_PATH.PLUGIN);
    revalidatePath(CATALOG_LIST_PATH.THEME);
  }

  if (kind && slug) {
    revalidatePath(`${CATALOG_LIST_PATH[kind]}/${slug}`);
  }

  // The homepage shows the newest published entries.
  revalidatePath('/');
}

/**
 * A legal document was published, saved or restored. The footer links all three
 * documents on every page, so the homepage is included.
 */
export function revalidateLegalDocument(type: string): void {
  revalidateTag(CACHE_TAGS.legal, 'max');
  revalidateTag(CACHE_TAGS.legalType(type), 'max');

  const path = LEGAL_PATH[type];
  if (path) {
    revalidatePath(path);
  }
  revalidatePath('/');
}
