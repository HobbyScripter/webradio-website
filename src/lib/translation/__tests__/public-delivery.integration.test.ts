/**
 * @jest-environment node
 *
 * B1 + B2 against a real PostgreSQL database (`npm run test:integration`).
 *
 * B1: the public loaders — list and detail, news, partners and legal documents —
 * deliver approved, current translations and fall back to German for everything
 * else. Nothing here mocks the data layer, so this covers the actual SQL path a
 * page takes.
 *
 * B2: `claimJob` is exercised by several workers at the same time, and two full
 * translation batches run concurrently. Every job may be claimed once, no
 * provider call may be duplicated and no translation row may be written twice.
 */
import { db } from '@/lib/db';
import { getPublishedNewsBySlug, listPublishedNews } from '@/lib/catalog';
import { PartnerService } from '@/lib/partner/service';
import { getPublishedLegalDocument } from '@/lib/legal-document-service';
import { claimJob, hashSourceText, jobKeyFor } from '../jobs';
import { runTranslationBatch } from '../engine';
import { MockProvider } from '../providers/mock';
import type { Locale } from '@/i18n/config';
import type { TranslateInput, TranslationOutcome, TranslationProvider } from '../types';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
// A high batch limit keeps the concurrent run deterministic: other suites leave
// published news fixtures in the database, and with the default limit of 20 the
// article seeded here could fall outside the batch.
const ENV = { NODE_ENV: 'test', TRANSLATION_BATCH_LIMIT: '200' } as Record<
  string,
  string | undefined
>;

const NEWS_TITLE = `Pressemitteilung ${RUN}`;
const NEWS_SUMMARY = `Zusammenfassung ${RUN}`;
const NEWS_CONTENT = `Inhalt der Meldung ${RUN}`;
const DRAFT_SLUG = `draft-${RUN}`;
const PARTNER_NAME = `Partner ${RUN}`;
const PARTNER_DESCRIPTION = `Beschreibung ${RUN}`;
const LEGAL_CONTENT = `Impressumstext ${RUN}`;

const ids = {
  news: '',
  draft: '',
  partner: '',
  legal: '',
};

async function seedTranslation(input: {
  entityType: string;
  entityId: string;
  locale: Locale;
  field: string;
  value: string;
  source: string;
  status?: 'APPROVED' | 'REJECTED' | 'MACHINE_TRANSLATED';
  outdated?: boolean;
}): Promise<void> {
  await db.orm.public.ContentTranslation.create({
    entityType: input.entityType,
    entityId: input.entityId,
    locale: input.locale,
    field: input.field,
    value: input.value,
    status: input.status ?? 'APPROVED',
    provider: 'mock',
    sourceHash: hashSourceText(input.source),
    outdated: input.outdated ?? false,
  });
}

beforeAll(async () => {
  const news = await db.orm.public.News.create({
    slug: `news-${RUN}`,
    title: NEWS_TITLE,
    summary: NEWS_SUMMARY,
    content: NEWS_CONTENT,
    isPublished: true,
    publishedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  ids.news = news.id;

  const draft = await db.orm.public.News.create({
    slug: DRAFT_SLUG,
    title: `Entwurf ${RUN}`,
    summary: 'Entwurf',
    content: 'Nicht öffentlich',
    isPublished: false,
    publishedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  ids.draft = draft.id;

  const partner = await db.orm.public.Partner.create({
    companyName: PARTNER_NAME,
    description: PARTNER_DESCRIPTION,
    status: 'ACTIVE',
  });
  ids.partner = partner.id;

  const legal = await db.orm.public.LegalDocument.create({
    type: 'IMPRESSUM',
    versionNumber: 900_000 + Math.floor(Math.random() * 90_000),
    title: `Impressum ${RUN}`,
    content: LEGAL_CONTENT,
    status: 'PUBLISHED',
    publishedAt: Temporal.Now.instant(),
  });
  ids.legal = legal.id;

  // News: approved title (en), approved title (pl), rejected summary (en),
  // outdated content (en).
  await seedTranslation({
    entityType: 'News',
    entityId: ids.news,
    locale: 'en',
    field: 'title',
    value: `Press release ${RUN}`,
    source: NEWS_TITLE,
  });
  await seedTranslation({
    entityType: 'News',
    entityId: ids.news,
    locale: 'en',
    field: 'summary',
    value: `REJECTED summary ${RUN}`,
    source: NEWS_SUMMARY,
    status: 'REJECTED',
  });
  await seedTranslation({
    entityType: 'News',
    entityId: ids.news,
    locale: 'en',
    field: 'content',
    value: `OUTDATED content ${RUN}`,
    source: NEWS_CONTENT,
    outdated: true,
  });
  await seedTranslation({
    entityType: 'News',
    entityId: ids.news,
    locale: 'pl',
    field: 'title',
    value: `Komunikat ${RUN}`,
    source: NEWS_TITLE,
  });

  // The draft has an approved translation but must stay unreachable.
  await seedTranslation({
    entityType: 'News',
    entityId: ids.draft,
    locale: 'en',
    field: 'title',
    value: `Draft ${RUN}`,
    source: `Entwurf ${RUN}`,
  });

  await seedTranslation({
    entityType: 'Partner',
    entityId: ids.partner,
    locale: 'en',
    field: 'description',
    value: `Description ${RUN}`,
    source: PARTNER_DESCRIPTION,
  });

  await seedTranslation({
    entityType: 'LegalDocument',
    entityId: ids.legal,
    locale: 'en',
    field: 'content',
    value: `Imprint text ${RUN}`,
    source: LEGAL_CONTENT,
  });
});

afterAll(async () => {
  const entityIds = [ids.news, ids.draft, ids.partner, ids.legal].filter(Boolean);
  for (const entityId of entityIds) {
    await db.orm.public.ContentTranslation.where({ entityId }).delete();
    await db.orm.public.TranslationJob.where({ entityId }).delete();
  }
  if (ids.news) await db.orm.public.News.where({ id: ids.news }).delete();
  if (ids.draft) await db.orm.public.News.where({ id: ids.draft }).delete();
  if (ids.partner) await db.orm.public.Partner.where({ id: ids.partner }).delete();
  if (ids.legal) await db.orm.public.LegalDocument.where({ id: ids.legal }).delete();
});

describe('B1 — public delivery', () => {
  it('serves an approved English title on /en/', async () => {
    const news = await listPublishedNews(100, 'en');
    const entry = news.find((item) => item.id === ids.news);

    expect(entry?.title).toBe(`Press release ${RUN}`);
    // Rejected translation falls back to German.
    expect(entry?.summary).toBe(NEWS_SUMMARY);
    // Outdated translation falls back to German.
    expect(entry?.content).toBe(NEWS_CONTENT);
  });

  it('serves an approved Polish title on /pl/', async () => {
    const news = await listPublishedNews(100, 'pl');
    const entry = news.find((item) => item.id === ids.news);

    expect(entry?.title).toBe(`Komunikat ${RUN}`);
    // No Polish summary exists.
    expect(entry?.summary).toBe(NEWS_SUMMARY);
  });

  it('serves German on /de/ regardless of stored rows', async () => {
    const news = await listPublishedNews(100, 'de');
    const entry = news.find((item) => item.id === ids.news);

    expect(entry?.title).toBe(NEWS_TITLE);
    expect(entry?.summary).toBe(NEWS_SUMMARY);
    expect(entry?.content).toBe(NEWS_CONTENT);
  });

  it('localizes the news detail page', async () => {
    const entry = await getPublishedNewsBySlug(`news-${RUN}`, 'en');
    expect(entry?.title).toBe(`Press release ${RUN}`);
    expect(entry?.content).toBe(NEWS_CONTENT);
  });

  it('falls back to German when a translation is missing everywhere', async () => {
    const entry = await getPublishedNewsBySlug(`news-${RUN}`, 'fr');
    expect(entry?.title).toBe(NEWS_TITLE);
    expect(entry?.summary).toBe(NEWS_SUMMARY);
  });

  it('localizes a public partner description but not its company name', async () => {
    const partners = await PartnerService.getPublicPartners('en');
    const partner = partners.find((item) => item.id === ids.partner);

    expect(partner?.description).toBe(`Description ${RUN}`);
    expect(partner?.companyName).toBe(PARTNER_NAME);
  });

  it('localizes a published legal document', async () => {
    const document = await getPublishedLegalDocument('IMPRESSUM', 'en');
    expect(document?.content).toBe(`Imprint text ${RUN}`);
  });

  it('keeps a non-public entity unreachable even with an approved translation', async () => {
    expect(await getPublishedNewsBySlug(DRAFT_SLUG, 'en')).toBeNull();

    const news = await listPublishedNews(100, 'en');
    expect(news.some((item) => item.id === ids.draft)).toBe(false);
  });
});

describe('B2 — atomic job claim', () => {
  async function createJob(entityId: string, field: string) {
    const sourceHash = hashSourceText(field === 'title' ? NEWS_TITLE : NEWS_SUMMARY);
    return db.orm.public.TranslationJob.create({
      jobKey: jobKeyFor({ entityType: 'News', entityId, locale: 'en', field, sourceHash }),
      entityType: 'News',
      entityId,
      locale: 'en',
      field,
      provider: 'mock',
      status: 'PENDING',
      sourceHash,
    });
  }

  it('lets exactly one of six concurrent workers claim a job', async () => {
    const job = await createJob(ids.news, 'claim-single');

    const claims = await Promise.all(
      Array.from({ length: 6 }, () => claimJob(job.id)),
    );

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    const stored = (await db.orm.public.TranslationJob.where({ id: job.id }).first()) as Record<
      string,
      unknown
    >;
    expect(stored.status).toBe('RUNNING');
    expect(stored.attempts).toBe(1);
  });

  it('never lets a second claim through after the first one succeeded', async () => {
    const job = await createJob(ids.news, 'claim-sequential');
    expect(await claimJob(job.id)).not.toBeNull();
    expect(await claimJob(job.id)).toBeNull();

    const stored = (await db.orm.public.TranslationJob.where({ id: job.id }).first()) as Record<
      string,
      unknown
    >;
    expect(stored.attempts).toBe(1);
  });

  it('claims distinct jobs in parallel without losing one', async () => {
    const jobs = await Promise.all(
      ['alpha', 'beta', 'gamma', 'delta'].map((field) => createJob(ids.news, `parallel-${field}`)),
    );

    const claims = await Promise.all(
      jobs.map((job) => Promise.all([claimJob(job.id), claimJob(job.id)])),
    );

    for (const pair of claims) {
      expect(pair.filter((claim) => claim !== null)).toHaveLength(1);
    }
  });

  it('runs two full batches at the same time without duplicate calls or rows', async () => {
    const requests: string[] = [];

    class CountingProvider extends MockProvider implements TranslationProvider {
      async translate(input: TranslateInput): Promise<TranslationOutcome> {
        requests.push(`${input.targetLocale}:${input.text}`);
        return super.translate(input);
      }
    }

    const provider = new CountingProvider();

    const [first, second] = await Promise.all([
      runTranslationBatch({
        locales: ['en'],
        entityTypes: ['News'],
        provider,
        env: ENV,
        limit: 200,
        force: true,
      }),
      runTranslationBatch({
        locales: ['en'],
        entityTypes: ['News'],
        provider,
        env: ENV,
        limit: 200,
        force: true,
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.failed).toBe(0);
    expect(second.failed).toBe(0);

    // Identical German text legitimately occurs in several fields of *different*
    // articles (the browser fixtures share a summary), and each of those is its
    // own job. What must never happen is this article's text being sent twice,
    // which is exactly what a duplicated claim produces.
    const own = requests.filter((entry) => entry.includes(RUN));
    expect(own.length).toBeGreaterThan(0);
    expect(own.length).toBe(new Set(own).size);

    const rows = await db.orm.public.ContentTranslation.where({
      entityType: 'News',
      entityId: ids.news,
      locale: 'en',
    }).all();
    const keys = (rows as Record<string, unknown>[]).map((row) => `${String(row.field)}`);
    expect(keys.length).toBe(new Set(keys).size);

    // Only the real fields of this article — the jobs claimed by hand above are
    // deliberately still RUNNING and have nothing to do with the batches.
    const jobs = (
      await db.orm.public.TranslationJob.where({ entityId: ids.news }).all()
    ).filter((job) => ['title', 'summary', 'content'].includes(String(job.field)));
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs as Record<string, unknown>[]) {
      expect(['SUCCEEDED', 'SKIPPED', 'PENDING']).toContain(String(job.status));
      // One claim per job: a second worker must not re-run finished work.
      expect(job.attempts).toBe(1);
    }

    const failures = await db.orm.public.TranslationEvent.where({
      entityId: ids.news,
      action: 'FAILED',
    }).all();
    expect(failures).toHaveLength(0);
  });
});
