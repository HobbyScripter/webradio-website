/**
 * Source records that may be machine-translated.
 *
 * Only **published, public** content is ever loaded: drafts, internal notes,
 * suspended advertisers and unpublished legal versions never reach this module,
 * so they can never be sent to an external provider. That is the privacy half of
 * the rule "keine vertraulichen internen Informationen an Übersetzungsanbieter".
 *
 * The field list mirrors `TRANSLATABLE_FIELDS` in `content-translations.ts` and
 * is deliberately hard-coded: a generic schema walk would eventually pick up a
 * column that must not leave the database.
 */
import { db } from '@/lib/db';

export type SourceField = { field: string; value: string };

export type SourceRecord = {
  entityType: string;
  entityId: string;
  /** Human-readable hint for the admin overview (name, title, slug). */
  label: string;
  fields: SourceField[];
};

export type LoadSourcesResult = {
  records: SourceRecord[];
  /** Entities whose table could not be read (schema not migrated yet). */
  skippedEntityTypes: string[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function loadPlugins(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.Plugin.where({ isPublished: true })
    .select('id', 'slug', 'name', 'description')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'Plugin',
      entityId: String(row.id),
      label: text(row.name) || text(row.slug) || String(row.id),
      fields: [
        { field: 'name', value: text(row.name) },
        { field: 'description', value: text(row.description) },
      ].filter((field) => field.value.trim() !== ''),
    }));
}

async function loadThemes(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.Theme.where({ isPublished: true })
    .select('id', 'slug', 'name', 'description')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'Theme',
      entityId: String(row.id),
      label: text(row.name) || text(row.slug) || String(row.id),
      fields: [
        { field: 'name', value: text(row.name) },
        { field: 'description', value: text(row.description) },
      ].filter((field) => field.value.trim() !== ''),
    }));
}

async function loadPartners(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.Partner.where({ status: 'ACTIVE' })
    .select('id', 'companyName', 'description')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'Partner',
      entityId: String(row.id),
      label: text(row.companyName) || String(row.id),
      fields: [{ field: 'description', value: text(row.description) }].filter(
        (field) => field.value.trim() !== '',
      ),
    }));
}

async function loadAdvertisers(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.Advertiser.where({ status: 'ACTIVE' })
    .select('id', 'companyName', 'description')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'Advertiser',
      entityId: String(row.id),
      label: text(row.companyName) || String(row.id),
      fields: [{ field: 'description', value: text(row.description) }].filter(
        (field) => field.value.trim() !== '',
      ),
    }));
}

async function loadCampaigns(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.AdCampaign.where({ status: 'ACTIVE' })
    .select('id', 'name', 'description')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'AdCampaign',
      entityId: String(row.id),
      label: text(row.name) || String(row.id),
      fields: [
        { field: 'name', value: text(row.name) },
        { field: 'description', value: text(row.description) },
      ].filter((field) => field.value.trim() !== ''),
    }));
}

async function loadNews(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.News.where({ isPublished: true })
    .select('id', 'slug', 'title', 'summary', 'content')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'News',
      entityId: String(row.id),
      label: text(row.title) || text(row.slug) || String(row.id),
      fields: [
        { field: 'title', value: text(row.title) },
        { field: 'summary', value: text(row.summary) },
        { field: 'content', value: text(row.content) },
      ].filter((field) => field.value.trim() !== ''),
    }));
}

async function loadRoadmap(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.RoadmapItem.where({})
    .select('id', 'title', 'description')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'RoadmapItem',
      entityId: String(row.id),
      label: text(row.title) || String(row.id),
      fields: [
        { field: 'title', value: text(row.title) },
        { field: 'description', value: text(row.description) },
      ].filter((field) => field.value.trim() !== ''),
    }));
}

async function loadLegalDocuments(): Promise<SourceRecord[]> {
  const rows = await db.orm.public.LegalDocument.where({ status: 'PUBLISHED' })
    .select('id', 'type', 'versionNumber', 'title', 'content')
    .all();
  return rows
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      entityType: 'LegalDocument',
      entityId: String(row.id),
      label: [text(row.type), `v${String(row.versionNumber)}`].filter(Boolean).join(' '),
      fields: [
        { field: 'title', value: text(row.title) },
        { field: 'content', value: text(row.content) },
      ].filter((field) => field.value.trim() !== ''),
    }));
}

const LOADERS: Record<string, () => Promise<SourceRecord[]>> = {
  Plugin: loadPlugins,
  Theme: loadThemes,
  Partner: loadPartners,
  Advertiser: loadAdvertisers,
  AdCampaign: loadCampaigns,
  News: loadNews,
  RoadmapItem: loadRoadmap,
  LegalDocument: loadLegalDocuments,
};

/** Entity types the engine can translate, in display order. */
export function listSourceEntityTypes(): string[] {
  return Object.keys(LOADERS);
}

/**
 * Load every published source record, optionally restricted to some entities.
 *
 * A failing entity (for example a table from a migration that has not been
 * applied yet) is reported instead of breaking the whole overview: the admin UI
 * then shows what is readable and names what is not.
 */
export async function loadTranslatableSources(
  entityTypes?: readonly string[],
): Promise<LoadSourcesResult> {
  const wanted = entityTypes && entityTypes.length > 0 ? entityTypes : listSourceEntityTypes();
  const records: SourceRecord[] = [];
  const skippedEntityTypes: string[] = [];

  for (const entityType of wanted) {
    const loader = LOADERS[entityType];
    if (!loader) {
      skippedEntityTypes.push(entityType);
      continue;
    }
    try {
      records.push(...(await loader()));
    } catch (error) {
      skippedEntityTypes.push(entityType);
      console.warn(
        JSON.stringify({
          event: 'translation.source.unavailable',
          entityType,
          reason: error instanceof Error ? error.name : 'unknown',
        }),
      );
    }
  }

  return { records, skippedEntityTypes };
}
