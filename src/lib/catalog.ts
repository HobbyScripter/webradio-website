/**
 * Public catalogue reads.
 *
 * Every query filters on `isPublished` AND the approval status, so drafts,
 * pending and rejected entries can never reach a public page or API route.
 * Only whitelisted fields are mapped into the DTOs below.
 */
import { cache } from 'react';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { db } from './db';
import { pageOffset, type CatalogSort } from './catalog-query';

export type PluginSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  developerName: string;
  tags: string[];
  downloads: number;
  latestVersion: string | null;
  updatedAt: string;
};

export type PluginDetail = PluginSummary & {
  developer: {
    displayName: string;
    githubUrl: string | null;
    websiteUrl: string | null;
    bio: string | null;
  };
  screenshots: { url: string; caption: string | null }[];
  versions: {
    version: string;
    description: string | null;
    fileUrl: string;
    fileSize: number;
    checksum: string;
    minWebradioVersion: string | null;
    maxWebradioVersion: string | null;
    releasedAt: string;
    isLatest: boolean;
  }[];
};

export type ThemeSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  developerName: string;
  tags: string[];
  downloads: number;
  latestVersion: string | null;
  updatedAt: string;
};

export type ThemeDetail = ThemeSummary & {
  developer: PluginDetail['developer'];
  screenshots: { url: string; caption: string | null }[];
  versions: {
    version: string;
    description: string | null;
    fileUrl: string;
    fileSize: number;
    checksum: string;
    minWebradioVersion: string | null;
    maxWebradioVersion: string | null;
    releasedAt: string;
    isLatest: boolean;
  }[];
};

export type ReleaseEntry = {
  id: string;
  version: string;
  title: string;
  description: string;
  releaseDate: string;
  isLatest: boolean;
  downloadUrl: string | null;
  fileSize: number | null;
  checksum: string | null;
  changelogs: { category: string; text: string }[];
};

export type NewsEntry = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  publishedAt: string | null;
};

export type RoadmapEntry = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  targetDate: string | null;
  completedAt: string | null;
};

type PluginRow = Awaited<ReturnType<typeof fetchPluginList>>[number];
type ThemeRow = Awaited<ReturnType<typeof fetchThemeList>>[number];

function latestVersion(versions: readonly { version: string; isLatest: boolean }[]): string | null {
  const latest = versions.find((entry) => entry.isLatest);
  return latest ? latest.version : null;
}

function fetchPluginList(input: {
  q: string;
  sort: CatalogSort;
  offset: number;
  take: number;
}) {
  const pattern = input.q ? `%${input.q}%` : null;

  const base = db.orm.public.Plugin.where((p) =>
    pattern
      ? and(
          p.isPublished.eq(true),
          p.status.eq('APPROVED'),
          or(p.name.ilike(pattern), p.description.ilike(pattern)),
        )
      : and(p.isPublished.eq(true), p.status.eq('APPROVED')),
  )
    .include('developer', (developer) => developer.select('displayName'))
    .include('tags', (tags) => tags.select('tag'))
    .include('versions', (versions) => versions.select('version', 'isLatest'));

  if (input.sort === 'name') {
    return base
      .orderBy([(p) => p.name.asc(), (p) => p.id.asc()])
      .offset(input.offset)
      .limit(input.take)
      .all();
  }
  if (input.sort === 'downloads') {
    return base
      .orderBy([(p) => p.downloads.desc(), (p) => p.name.asc()])
      .offset(input.offset)
      .limit(input.take)
      .all();
  }
  return base
    .orderBy([(p) => p.updatedAt.desc(), (p) => p.id.desc()])
    .offset(input.offset)
    .limit(input.take)
    .all();
}

function fetchThemeList(input: {
  q: string;
  sort: CatalogSort;
  offset: number;
  take: number;
}) {
  const pattern = input.q ? `%${input.q}%` : null;

  const base = db.orm.public.Theme.where((t) =>
    pattern
      ? and(
          t.isPublished.eq(true),
          t.status.eq('APPROVED'),
          or(t.name.ilike(pattern), t.description.ilike(pattern)),
        )
      : and(t.isPublished.eq(true), t.status.eq('APPROVED')),
  )
    .include('developer', (developer) => developer.select('displayName'))
    .include('tags', (tags) => tags.select('tag'))
    .include('versions', (versions) => versions.select('version', 'isLatest'));

  if (input.sort === 'name') {
    return base
      .orderBy([(t) => t.name.asc(), (t) => t.id.asc()])
      .offset(input.offset)
      .limit(input.take)
      .all();
  }
  if (input.sort === 'downloads') {
    return base
      .orderBy([(t) => t.downloads.desc(), (t) => t.name.asc()])
      .offset(input.offset)
      .limit(input.take)
      .all();
  }
  return base
    .orderBy([(t) => t.updatedAt.desc(), (t) => t.id.desc()])
    .offset(input.offset)
    .limit(input.take)
    .all();
}

function toPluginSummary(row: PluginRow): PluginSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    developerName: row.developer?.displayName ?? 'Unbekannt',
    tags: row.tags.map((tag) => tag.tag).sort((a, b) => a.localeCompare(b, 'de')),
    downloads: row.downloads,
    latestVersion: latestVersion(row.versions),
    updatedAt: row.updatedAt.toString(),
  };
}

function toThemeSummary(row: ThemeRow): ThemeSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    developerName: row.developer?.displayName ?? 'Unbekannt',
    tags: row.tags.map((tag) => tag.tag).sort((a, b) => a.localeCompare(b, 'de')),
    downloads: row.downloads,
    latestVersion: latestVersion(row.versions),
    updatedAt: row.updatedAt.toString(),
  };
}

export async function listPublishedPlugins(input: {
  q: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}): Promise<{ items: PluginSummary[]; hasNext: boolean }> {
  const rows = await fetchPluginList({
    q: input.q,
    sort: input.sort,
    offset: pageOffset(input.page, input.pageSize),
    take: input.pageSize + 1,
  });

  return {
    items: rows.slice(0, input.pageSize).map(toPluginSummary),
    hasNext: rows.length > input.pageSize,
  };
}

export async function listPublishedThemes(input: {
  q: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
}): Promise<{ items: ThemeSummary[]; hasNext: boolean }> {
  const rows = await fetchThemeList({
    q: input.q,
    sort: input.sort,
    offset: pageOffset(input.page, input.pageSize),
    take: input.pageSize + 1,
  });

  return {
    items: rows.slice(0, input.pageSize).map(toThemeSummary),
    hasNext: rows.length > input.pageSize,
  };
}

async function queryPublishedPluginBySlug(slug: string): Promise<PluginDetail | null> {
  const row = await db.orm.public.Plugin.where((p) =>
    and(p.slug.eq(slug), p.isPublished.eq(true), p.status.eq('APPROVED')),
  )
    .include('developer')
    .include('tags', (tags) => tags.select('tag'))
    .include('screenshots', (screenshots) =>
      screenshots.select('url', 'caption', 'order').orderBy((s) => s.order.asc()),
    )
    .include('versions', (versions) =>
      versions
        .select(
          'version',
          'description',
          'fileUrl',
          'fileSize',
          'checksum',
          'minWebradioVersion',
          'maxWebradioVersion',
          'releasedAt',
          'isLatest',
        )
        .orderBy((v) => v.releasedAt.desc()),
    )
    .first();

  if (!row) {
    return null;
  }

  const summary = toPluginSummary(row);

  return {
    ...summary,
    developer: {
      displayName: row.developer?.displayName ?? 'Unbekannt',
      githubUrl: row.developer?.githubUrl ?? null,
      websiteUrl: row.developer?.websiteUrl ?? null,
      bio: row.developer?.bio ?? null,
    },
    screenshots: row.screenshots.map((shot) => ({ url: shot.url, caption: shot.caption })),
    versions: row.versions.map((version) => ({
      version: version.version,
      description: version.description,
      fileUrl: version.fileUrl,
      fileSize: version.fileSize,
      checksum: version.checksum,
      minWebradioVersion: version.minWebradioVersion,
      maxWebradioVersion: version.maxWebradioVersion,
      releasedAt: version.releasedAt.toString(),
      isLatest: version.isLatest,
    })),
  };
}

async function queryPublishedThemeBySlug(slug: string): Promise<ThemeDetail | null> {
  const row = await db.orm.public.Theme.where((t) =>
    and(t.slug.eq(slug), t.isPublished.eq(true), t.status.eq('APPROVED')),
  )
    .include('developer')
    .include('tags', (tags) => tags.select('tag'))
    .include('screenshots', (screenshots) =>
      screenshots.select('url', 'caption', 'order').orderBy((s) => s.order.asc()),
    )
    .include('versions', (versions) =>
      versions
        .select(
          'version',
          'description',
          'fileUrl',
          'fileSize',
          'checksum',
          'minWebradioVersion',
          'maxWebradioVersion',
          'releasedAt',
          'isLatest',
        )
        .orderBy((v) => v.releasedAt.desc()),
    )
    .first();

  if (!row) {
    return null;
  }

  const summary = toThemeSummary(row);

  return {
    ...summary,
    developer: {
      displayName: row.developer?.displayName ?? 'Unbekannt',
      githubUrl: row.developer?.githubUrl ?? null,
      websiteUrl: row.developer?.websiteUrl ?? null,
      bio: row.developer?.bio ?? null,
    },
    screenshots: row.screenshots.map((shot) => ({ url: shot.url, caption: shot.caption })),
    versions: row.versions.map((version) => ({
      version: version.version,
      description: version.description,
      fileUrl: version.fileUrl,
      fileSize: version.fileSize,
      checksum: version.checksum,
      minWebradioVersion: version.minWebradioVersion,
      maxWebradioVersion: version.maxWebradioVersion,
      releasedAt: version.releasedAt.toString(),
      isLatest: version.isLatest,
    })),
  };
}

/** Request-scoped dedupe between generateMetadata and the page render. */
export const getPublishedPluginBySlug = cache(queryPublishedPluginBySlug);
export const getPublishedThemeBySlug = cache(queryPublishedThemeBySlug);
export const getPublishedNewsBySlug = cache(queryPublishedNewsBySlug);

export async function listReleases(limit = 20): Promise<ReleaseEntry[]> {
  const rows = await db.orm.public.Release.include('changelogs', (changelogs) =>
    changelogs.select('category', 'text', 'createdAt').orderBy((c) => c.createdAt.asc()),
  )
    .orderBy([(r) => r.releaseDate.desc(), (r) => r.id.desc()])
    .limit(limit)
    .all();

  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    description: row.description,
    releaseDate: row.releaseDate.toString(),
    isLatest: row.isLatest,
    downloadUrl: row.downloadUrl,
    fileSize: row.fileSize,
    checksum: row.checksum,
    changelogs: row.changelogs.map((entry) => ({
      category: entry.category,
      text: entry.text,
    })),
  }));
}

export async function listPublishedNews(limit = 20): Promise<NewsEntry[]> {
  const now = Temporal.Now.instant();
  const rows = await db.orm.public.News.where((n) =>
    and(n.isPublished.eq(true), n.publishedAt.lte(now)),
  )
    .orderBy([(n) => n.publishedAt.desc(), (n) => n.id.desc()])
    .limit(limit)
    .all();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? '',
    content: row.content,
    publishedAt: row.publishedAt ? row.publishedAt.toString() : null,
  }));
}

async function queryPublishedNewsBySlug(slug: string): Promise<NewsEntry | null> {
  const now = Temporal.Now.instant();
  const row = await db.orm.public.News.where((n) =>
    and(n.slug.eq(slug), n.isPublished.eq(true), n.publishedAt.lte(now)),
  ).first();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? '',
    content: row.content,
    publishedAt: row.publishedAt ? row.publishedAt.toString() : null,
  };
}

export async function listRoadmapItems(): Promise<RoadmapEntry[]> {
  const rows = await db.orm.public.RoadmapItem.orderBy([
    (item) => item.priority.desc(),
    (item) => item.createdAt.asc(),
  ]).all();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    targetDate: row.targetDate ? row.targetDate.toString() : null,
    completedAt: row.completedAt ? row.completedAt.toString() : null,
  }));
}
