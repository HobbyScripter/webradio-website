import { db } from '@/lib/db';
import { z } from 'zod';
import type { Locale } from '@/i18n/config';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import * as lucideIcons from 'lucide-react';

const VALID_ICON_NAMES = new Set(Object.keys(lucideIcons));

const iconNameSchema = z
  .string()
  .max(64)
  .optional()
  .refine((icon) => !icon || VALID_ICON_NAMES.has(icon), 'Ungültiger Icon-Name');

const linkUrlSchema = z.string().min(1).max(500);

export const CUSTOM_LINKS_CACHE_TAG = 'custom-links';

const SUPPORTED_LOCALES = ['de', 'en', 'nl', 'fr', 'es', 'it', 'pl'] as const;

export const customLinkSchema = z.object({
  position: z.enum(['MAIN_NAVIGATION', 'FOOTER']),
  sortOrder: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  url: linkUrlSchema,
  type: z.enum(['INTERNAL', 'EXTERNAL']),
  openInNewTab: z.boolean(),
  iconName: iconNameSchema,
  labels: z
    .record(z.string(), z.string().min(1).max(50))
    .refine((labels) => Object.keys(labels).length > 0, 'Mindestens eine Beschriftung ist nötig')
    // Only supported locales are stored; unknown keys are rejected instead of
    // silently creating labels no visitor can ever see.
    .refine(
      (labels) => Object.keys(labels).every((locale) => (SUPPORTED_LOCALES as readonly string[]).includes(locale)),
      'Unbekannte Sprache',
    ),
});

export type CustomLinkInput = z.infer<typeof customLinkSchema>;

export type PublicCustomLink = {
  id: string;
  url: string;
  type: 'INTERNAL' | 'EXTERNAL';
  position: 'MAIN_NAVIGATION' | 'FOOTER';
  openInNewTab: boolean;
  iconName: string | null;
  sortOrder: number;
  label: string;
};

export type CustomLinkWithLabels = {
  id: string;
  position: 'MAIN_NAVIGATION' | 'FOOTER';
  sortOrder: number;
  isActive: boolean;
  url: string;
  type: 'INTERNAL' | 'EXTERNAL';
  openInNewTab: boolean;
  iconName: string | null;
  labels: Record<string, string>;
};

type Position = 'MAIN_NAVIGATION' | 'FOOTER';

/**
 * Stable error codes. The API returns them, and the admin UI maps them to a
 * translated message, so no German text has to travel from the server.
 */
export type CustomLinkErrorCode =
  | 'INVALID_DATA'
  | 'LIMIT_REACHED'
  | 'NOT_FOUND'
  | 'INVALID_INTERNAL_URL'
  | 'INVALID_EXTERNAL_URL'
  | 'INVALID_ICON';

export class CustomLinkError extends Error {
  readonly code: CustomLinkErrorCode;

  constructor(code: CustomLinkErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CustomLinkError';
    this.code = code;
  }
}

/**
 * Cache invalidation must not break non-request contexts (tests, scripts).
 * `revalidateTag` is a no-op outside a render/route scope.
 */
function invalidatePublicCache() {
  try {
    revalidateTag(CUSTOM_LINKS_CACHE_TAG, 'max');
  } catch {
    // Outside a Next.js request scope there is no cache to invalidate.
  }
}

/**
 * Custom links are editorial navigation entries. They are validated once on
 * write and served without a second label query per link: the public reader
 * loads links and labels in two queries in total.
 */
export class CustomLinkService {
  static MAX_LINKS_PER_POSITION = 10;

  /** Admin listing. Labels for every link arrive in one additional query. */
  static async getCustomLinks(position?: Position, isActive?: boolean): Promise<CustomLinkWithLabels[]> {
    const links = await db.orm.public.CustomLink
      .where({
        ...(position ? { position } : {}),
        ...(isActive === undefined ? {} : { isActive }),
      })
      .orderBy((link) => link.sortOrder.asc())
      .all();

    if (links.length === 0) {
      return [];
    }

    const labels = await db.orm.public.CustomLinkLabel.where({}).all();
    const grouped = new Map<string, Record<string, string>>();
    for (const label of labels) {
      const bucket = grouped.get(label.linkId) ?? {};
      bucket[label.locale] = label.label;
      grouped.set(label.linkId, bucket);
    }

    return links.map((link) => ({
      id: link.id,
      position: link.position,
      sortOrder: link.sortOrder,
      isActive: link.isActive,
      url: link.url,
      type: link.type,
      openInNewTab: link.openInNewTab,
      iconName: link.iconName,
      labels: grouped.get(link.id) ?? {},
    }));
  }

  static async getCustomLinkById(id: string) {
    return db.orm.public.CustomLink.where({ id }).first();
  }

  static async createCustomLink(data: CustomLinkInput, userId?: string) {
    const validated = this.validate(data);
    // The cap applies to links visitors can see; drafts are always allowed.
    if (validated.isActive) {
      await this.assertLimit(validated.position);
    }

    const link = await db.orm.public.CustomLink.create({
      position: validated.position,
      sortOrder: validated.sortOrder,
      isActive: validated.isActive,
      url: validated.url,
      type: validated.type,
      openInNewTab: validated.openInNewTab,
      iconName: validated.iconName || null,
      createdBy: userId ?? null,
    });

    for (const [locale, label] of Object.entries(validated.labels)) {
      await db.orm.public.CustomLinkLabel.create({ linkId: link.id, locale, label });
    }

    invalidatePublicCache();
    return link;
  }

  static async updateCustomLink(id: string, data: Partial<CustomLinkInput>, userId?: string) {
    const link = await this.getCustomLinkById(id);
    if (!link) throw new CustomLinkError('NOT_FOUND');

    const validated = this.validatePartial(data);
    const nextPosition = validated.position ?? (link.position as Position);
    const nextIsActive = validated.isActive ?? link.isActive;

    if (validated.url || validated.type) {
      this.assertUrlMatchesType(validated.url ?? link.url, validated.type ?? link.type);
    }

    // Moving or re-activating a link must respect the same cap as creating one.
    // The link itself is only subtracted when it is currently active in the
    // target position; otherwise it was not part of that count.
    if (nextIsActive) {
      const isCountedAlready = link.isActive && link.position === nextPosition;
      await this.assertLimit(nextPosition, isCountedAlready ? id : undefined);
    }

    const updated = await db.orm.public.CustomLink.where({ id }).update({
      ...(validated.position ? { position: validated.position } : {}),
      ...(validated.sortOrder !== undefined ? { sortOrder: validated.sortOrder } : {}),
      ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      ...(validated.url ? { url: validated.url } : {}),
      ...(validated.type ? { type: validated.type } : {}),
      ...(validated.openInNewTab !== undefined ? { openInNewTab: validated.openInNewTab } : {}),
      ...(validated.iconName !== undefined ? { iconName: validated.iconName || null } : {}),
      ...(userId ? { updatedBy: userId } : {}),
    });

    if (validated.labels) {
      // Replace the label set: a locale removed in the form disappears here too.
      await db.orm.public.CustomLinkLabel.where({ linkId: id }).deleteAll();
      for (const [locale, label] of Object.entries(validated.labels)) {
        await db.orm.public.CustomLinkLabel.create({ linkId: id, locale, label });
      }
    }

    invalidatePublicCache();
    return updated;
  }

  static async deleteCustomLink(id: string) {
    await db.orm.public.CustomLinkLabel.where({ linkId: id }).deleteAll();
    const deleted = await db.orm.public.CustomLink.where({ id }).delete();
    invalidatePublicCache();
    return deleted;
  }

  /**
   * Links for a render position, with the label in the visitor's language.
   * A link without a translation for that language is left out rather than
   * shown with another language's text.
   */
  static async getPublicCustomLinks(position: Position, locale: Locale): Promise<PublicCustomLink[]> {
    const links = await db.orm.public.CustomLink
      .where({ position, isActive: true })
      .orderBy((link) => link.sortOrder.asc())
      .all();

    if (links.length === 0) {
      return [];
    }

    const labels = await db.orm.public.CustomLinkLabel.where({ locale }).all();
    const byLink = new Map(labels.map((label) => [label.linkId, label.label]));

    return links
      .map((link) => ({
        id: link.id,
        url: link.url,
        type: link.type,
        position: link.position,
        openInNewTab: link.openInNewTab,
        iconName: link.iconName,
        sortOrder: link.sortOrder,
        label: byLink.get(link.id) ?? '',
      }))
      .filter((link) => link.label.length > 0);
  }

  /** Internal links are site paths; external links must be absolute HTTP(S). */
  static isInternalUrl(url: string): boolean {
    return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
  }

  static isExternalUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private static validate(data: CustomLinkInput): CustomLinkInput {
    this.assertIconName(data.iconName);
    const parsed = customLinkSchema.safeParse(data);
    if (!parsed.success) {
      throw new CustomLinkError('INVALID_DATA', parsed.error.issues[0]?.message);
    }
    this.assertUrlMatchesType(parsed.data.url, parsed.data.type);
    return parsed.data;
  }

  private static validatePartial(data: Partial<CustomLinkInput>): Partial<CustomLinkInput> {
    this.assertIconName(data.iconName);
    const parsed = customLinkSchema.partial().safeParse(data);
    if (!parsed.success) {
      throw new CustomLinkError('INVALID_DATA', parsed.error.issues[0]?.message);
    }
    // URL/type compatibility is checked by the caller, which knows the stored
    // row when only one of the two fields is submitted.
    return parsed.data;
  }

  private static assertIconName(icon: string | null | undefined) {
    if (icon && !VALID_ICON_NAMES.has(icon)) {
      throw new CustomLinkError('INVALID_ICON');
    }
  }

  private static async assertLimit(position: Position, excludeId?: string) {
    const { count } = await db.orm.public.CustomLink
      .where({ position, isActive: true })
      .aggregate((aggregate) => ({ count: aggregate.count() }));

    const active = Number(count) - (excludeId ? 1 : 0);
    if (active >= this.MAX_LINKS_PER_POSITION) {
      throw new CustomLinkError('LIMIT_REACHED');
    }
  }

  private static assertUrlMatchesType(url: string, type: 'INTERNAL' | 'EXTERNAL') {
    if (type === 'INTERNAL' && !this.isInternalUrl(url)) {
      throw new CustomLinkError('INVALID_INTERNAL_URL');
    }
    if (type === 'EXTERNAL' && !this.isExternalUrl(url)) {
      throw new CustomLinkError('INVALID_EXTERNAL_URL');
    }
  }
}

/**
 * Cached public reader. The cache key covers position and locale, so switching
 * the language never serves another language's labels. Every mutation
 * invalidates the tag, so a deactivated or deleted link leaves the navigation
 * on the next request instead of lingering in a cached page.
 */
export async function getPublicCustomLinks(
  position: Position,
  locale: Locale,
): Promise<PublicCustomLink[]> {
  'use cache';
  cacheTag(CUSTOM_LINKS_CACHE_TAG);
  cacheLife('minutes');

  return CustomLinkService.getPublicCustomLinks(position, locale);
}
