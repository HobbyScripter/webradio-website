/**
 * @jest-environment node
 *
 * REAL PostgreSQL integration tests for the advertising and partner modules.
 *
 * Run with `npm run test:integration`, which points DATABASE_URL at a
 * disposable database whose name ends in `_test`. Nothing is mocked: every
 * query goes through the Prisma 8 runtime and the contract that ships with the
 * application.
 */
import 'temporal-polyfill/global';
import { db } from '../db';
import { AdvertisingService, utcDayStart } from '../advertising/service';
import { PartnerService } from '../partner/service';
import { calculateDuration } from '../partner/duration';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const APPLICATION_EMAIL = `ads_${RUN}@webradio.test`;

let advertiserId = '';
let campaignId = '';
let partnerId = '';
let inactivePartnerId = '';

function inMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

afterAll(async () => {
  if (advertiserId) {
    // Campaigns cascade to creatives, impressions and clicks.
    await db.orm.public.AdCampaign.where({ advertiserId }).deleteAll();
    await db.orm.public.Advertiser.where({ id: advertiserId }).delete();
  }
  await db.orm.public.AdvertisingApplication.where({ email: APPLICATION_EMAIL }).deleteAll();

  // Partners cascade to relationships and history.
  for (const id of [partnerId, inactivePartnerId].filter(Boolean)) {
    await db.orm.public.Partner.where({ id }).delete();
  }

  await db.close();
});

describe('Advertising module (real PostgreSQL)', () => {
  it('stores an application with PENDING status and Instant dates', async () => {
    const application = await AdvertisingService.createApplication({
      companyName: `Werbepartner ${RUN}`,
      contactName: 'Erika Musterfrau',
      email: APPLICATION_EMAIL,
      websiteUrl: 'https://example.com',
      phone: '',
      adFormat: 'BANNER',
      placement: 'HOMEPAGE',
      desiredStartDate: '2026-06-01',
      desiredEndDate: '',
      description: 'Wir möchten unsere Marke im Radio bewerben.',
      desiredBudget: '5000 EUR',
      customMessage: '',
      privacyConsent: true,
    });

    expect(application.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(application.status).toBe('PENDING');
    expect(application.desiredStartDate?.constructor.name).toBe('Instant');
    expect(application.desiredStartDate?.toString()).toBe('2026-06-01T00:00:00Z');
    expect(application.desiredEndDate).toBeNull();
    expect(application.reviewedById).toBeNull();
  });

  it('filters applications by status and keeps newest first', async () => {
    const pending = await AdvertisingService.getApplications({ status: 'PENDING' });
    expect(pending.some((entry) => entry.email === APPLICATION_EMAIL)).toBe(true);

    const approved = await AdvertisingService.getApplications({ status: 'APPROVED' });
    expect(approved.some((entry) => entry.email === APPLICATION_EMAIL)).toBe(false);

    // A stored review state is visible through the same filter.
    const application = await db.orm.public.AdvertisingApplication.first({
      email: APPLICATION_EMAIL,
    });
    expect(application).not.toBeNull();

    const updated = await AdvertisingService.updateApplicationStatus(
      application!.id,
      'UNDER_REVIEW',
      undefined,
      'Erstgespräch vereinbart',
      undefined,
    );
    expect(updated?.status).toBe('UNDER_REVIEW');
    expect(updated?.internalNotes).toBe('Erstgespräch vereinbart');
    expect(updated?.reviewedAt?.constructor.name).toBe('Instant');

    const underReview = await AdvertisingService.getApplications({ status: 'UNDER_REVIEW' });
    expect(underReview.some((entry) => entry.id === application!.id)).toBe(true);

    // Reset to PENDING so later assertions keep their meaning.
    await AdvertisingService.updateApplicationStatus(application!.id, 'PENDING');
  });

  it('creates an advertiser and maps a campaign to it', async () => {
    const advertiser = await AdvertisingService.createAdvertiser({
      companyName: `Werbepartner ${RUN}`,
      contactName: 'Max Beispiel',
      email: `advertiser_${RUN}@webradio.test`,
      websiteUrl: 'https://advertiser.example.com',
      description: 'Testadvertiser',
    });
    advertiserId = advertiser.id;
    expect(advertiser.status).toBe('ACTIVE');

    const campaign = await AdvertisingService.createCampaign({
      advertiserId,
      name: `Sommerkampagne ${RUN}`,
      description: 'Banner auf der Startseite',
      placement: 'HOMEPAGE',
      format: 'BANNER',
      startDate: '2026-06-01',
      endDate: '2026-08-31',
      targetUrl: 'https://example.com/sommer',
      internalNotes: 'Interner Hinweis',
    });
    campaignId = campaign.id;

    // The advertiser relation is stored, not the partner relation.
    expect(campaign.advertiserId).toBe(advertiserId);
    expect(campaign.partnerId).toBeNull();
    expect(campaign.status).toBe('DRAFT');
    expect(campaign.startDate.toString()).toBe('2026-06-01T00:00:00Z');
    expect(campaign.endDate.toString()).toBe('2026-08-31T00:00:00Z');

    const campaigns = await AdvertisingService.getCampaigns({ advertiserId });
    const found = campaigns.find((entry) => entry.id === campaignId);
    expect(found).toBeDefined();
    expect(found?.advertiser?.companyName).toBe(`Werbepartner ${RUN}`);

    const drafts = await AdvertisingService.getCampaigns({ status: 'DRAFT' });
    expect(drafts.some((entry) => entry.id === campaignId)).toBe(true);
  });

  it('rejects an end date that is not after the start date', async () => {
    await expect(
      AdvertisingService.createCampaign({
        advertiserId,
        name: `Ungültig ${RUN}`,
        placement: 'HOMEPAGE',
        format: 'BANNER',
        startDate: '2026-08-31',
        endDate: '2026-06-01',
        targetUrl: 'https://example.com/invalid',
      }),
    ).rejects.toThrow();
  });

  it('selects only live campaigns for a placement', async () => {
    const liveCampaign = await AdvertisingService.createCampaign({
      advertiserId,
      name: `Live ${RUN}`,
      placement: 'DOWNLOAD_PAGE',
      format: 'SPONSOR_CARD',
      startDate: inMinutes(-60).toISOString(),
      endDate: inMinutes(60).toISOString(),
      targetUrl: 'https://example.com/live',
    });
    await AdvertisingService.updateCampaignStatus(liveCampaign.id, 'ACTIVE');

    const active = await AdvertisingService.getActiveCampaigns('DOWNLOAD_PAGE');
    expect(active.some((entry) => entry.id === liveCampaign.id)).toBe(true);

    // The placement is part of the filter.
    const homepage = await AdvertisingService.getActiveCampaigns('HOMEPAGE');
    expect(homepage.some((entry) => entry.id === liveCampaign.id)).toBe(false);

    // The DRAFT campaign is never live, even inside its date window.
    expect(active.some((entry) => entry.id === campaignId)).toBe(false);

    await db.orm.public.AdCampaign.where({ id: liveCampaign.id }).delete();
  });

  it('aggregates impressions and clicks per UTC day without duplicates', async () => {
    await AdvertisingService.recordImpression(campaignId, 'HOMEPAGE');
    await AdvertisingService.recordImpression(campaignId, 'HOMEPAGE');
    await AdvertisingService.recordClick(campaignId, 'HOMEPAGE');

    const impressions = await db.orm.public.AdImpression.where({ campaignId }).all();
    expect(impressions).toHaveLength(1);
    expect(impressions[0]?.count).toBe(2);
    expect(impressions[0]?.day.toString()).toBe(utcDayStart().toString());

    const clicks = await db.orm.public.AdClick.where({ campaignId }).all();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.count).toBe(1);

    const stats = await AdvertisingService.getCampaignStats(campaignId);
    expect(stats.totalImpressions).toBe(2);
    expect(stats.totalClicks).toBe(1);
    expect(stats.ctr).toBe(50);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const future = await AdvertisingService.getCampaignStats(campaignId, tomorrow);
    expect(future).toEqual({ totalImpressions: 0, totalClicks: 0, ctr: 0 });
  });

  it('keeps internal notes when a review runs without resending them', async () => {
    const application = await db.orm.public.AdvertisingApplication.first({
      email: APPLICATION_EMAIL,
    });
    expect(application).not.toBeNull();

    await AdvertisingService.updateApplicationNotes(application!.id, 'Rückruf am Dienstag');

    const underReview = await AdvertisingService.updateApplicationStatus(
      application!.id,
      'UNDER_REVIEW',
    );
    expect(underReview?.internalNotes).toBe('Rückruf am Dienstag');

    const approved = await AdvertisingService.updateApplicationStatus(
      application!.id,
      'APPROVED',
    );
    expect(approved?.status).toBe('APPROVED');
    expect(approved?.internalNotes).toBe('Rückruf am Dienstag');
    expect(approved?.reviewedById).toBeNull();
  });

  it('refuses an application transition the status machine does not allow', async () => {
    const application = await db.orm.public.AdvertisingApplication.first({
      email: APPLICATION_EMAIL,
    });

    await expect(
      AdvertisingService.updateApplicationStatus(application!.id, 'UNDER_REVIEW'),
    ).rejects.toThrow(/nicht erlaubt/);
  });

  it('updates campaign content and assignment, and guards the status machine', async () => {
    const renamed = await AdvertisingService.updateCampaign({
      id: campaignId,
      name: `Sommerkampagne neu ${RUN}`,
      internalNotes: 'Neu verhandelt',
      placement: 'PUBLIC_PAGES',
    });

    expect(renamed?.name).toBe(`Sommerkampagne neu ${RUN}`);
    expect(renamed?.internalNotes).toBe('Neu verhandelt');
    expect(renamed?.placement).toBe('PUBLIC_PAGES');
    expect(renamed?.status).toBe('DRAFT');

    const activated = await AdvertisingService.updateCampaign({
      id: campaignId,
      status: 'ACTIVE',
    });
    expect(activated?.status).toBe('ACTIVE');

    const completed = await AdvertisingService.updateCampaign({
      id: campaignId,
      status: 'COMPLETED',
    });
    expect(completed?.status).toBe('COMPLETED');

    await expect(
      AdvertisingService.updateCampaign({ id: campaignId, status: 'ACTIVE' }),
    ).rejects.toThrow(/nicht erlaubt/);
  });

  it('derives the campaign count per advertiser without a schema change', async () => {
    const advertisers = await AdvertisingService.getAdvertisersWithCampaignCounts();
    const stored = advertisers.find((entry) => entry.id === advertiserId);

    expect(stored).toBeDefined();
    expect(stored!.campaignCount).toBeGreaterThanOrEqual(1);
  });

  it('stores, lists and deletes creatives for a campaign', async () => {
    const creative = await AdvertisingService.createCreative({
      campaignId,
      imageUrl: 'https://cdn.example.com/banner.png',
      altText: `Banner ${RUN}`,
      width: 728,
      height: 90,
      fileSize: 48_000,
      contentType: 'image/png',
    });

    expect(creative.campaignId).toBe(campaignId);
    expect(creative.width).toBe(728);

    const forCampaign = await AdvertisingService.getCreatives(campaignId);
    expect(forCampaign.some((entry) => entry.id === creative.id)).toBe(true);

    const deleted = await AdvertisingService.deleteCreative(creative.id);
    expect(deleted?.id).toBe(creative.id);

    const remaining = await AdvertisingService.getCreatives(campaignId);
    expect(remaining.some((entry) => entry.id === creative.id)).toBe(false);
  });

  it('summarises every placement, including campaigns and creatives', async () => {
    const overview = await AdvertisingService.getPlacementOverview();

    expect(overview.map((entry) => entry.placement)).toEqual([
      'HOMEPAGE',
      'DOWNLOAD_PAGE',
      'PUBLIC_PAGES',
    ]);

    const publicPages = overview.find((entry) => entry.placement === 'PUBLIC_PAGES');
    expect(publicPages?.totalCampaigns).toBeGreaterThanOrEqual(1);
    expect(publicPages?.activeCampaigns).toBe(0);
  });
});

describe('Partner portal (real PostgreSQL)', () => {
  it('stores one company with several partnership types at once', async () => {
    const partner = await PartnerService.createPartner({
      companyName: `Partner ${RUN}`,
      description: 'Mehrfachpartnerschaft',
      websiteUrl: 'https://partner.example.com',
      logoUrl: 'https://partner.example.com/logo.png',
      isFeatured: true,
    });
    partnerId = partner.id;
    expect(partner.status).toBe('ACTIVE');
    expect(partner.isFeatured).toBe(true);

    const official = await PartnerService.addRelationship({
      partnerId,
      type: 'OFFICIAL_PARTNER',
      startDate: Temporal.Instant.from('2022-01-01T00:00:00Z'),
      isPublic: true,
    });
    const sponsor = await PartnerService.addRelationship({
      partnerId,
      type: 'SPONSOR',
      startDate: Temporal.Instant.from('2023-01-01T00:00:00Z'),
      isPublic: true,
    });
    const technical = await PartnerService.addRelationship({
      partnerId,
      type: 'TECHNICAL_PARTNER',
      startDate: Temporal.Instant.from('2024-01-01T00:00:00Z'),
      isPublic: false,
    });

    expect(official.status).toBe('ACTIVE');
    expect(sponsor.type).toBe('SPONSOR');
    expect(technical.isPublic).toBe(false);

    const relationships = await db.orm.public.PartnerRelationship.where({ partnerId }).all();
    expect(relationships.map((entry) => entry.type).sort()).toEqual([
      'OFFICIAL_PARTNER',
      'SPONSOR',
      'TECHNICAL_PARTNER',
    ]);

    const adminPartners = await PartnerService.getPartners({ status: 'ACTIVE' });
    const stored = adminPartners.find((entry) => entry.id === partnerId);
    expect(stored?.relationships).toHaveLength(3);

    // Several types exist for the same company: the duration is per
    // relationship and is calculated from its own start date.
    expect(calculateDuration(stored!.relationships[0]!.startDate.toString())).toMatch(
      /Jahr|Monat|Tag/,
    );
  });

  it('ends a relationship, keeps the row and records the change', async () => {
    const relationship = await db.orm.public.PartnerRelationship.first({
      partnerId,
      type: 'SPONSOR',
    });
    expect(relationship).not.toBeNull();

    const ended = await PartnerService.updateRelationship(relationship!.id, {
      status: 'ENDED',
      endDate: Temporal.Instant.from('2025-12-31T00:00:00Z'),
    });
    expect(ended?.status).toBe('ENDED');
    expect(ended?.endDate?.toString()).toBe('2025-12-31T00:00:00Z');

    await PartnerService.recordHistory({
      partnerId,
      relationshipId: relationship!.id,
      action: 'RELATIONSHIP_UPDATED',
      details: 'Updated relationship to ENDED',
      performedBy: 'integration-test-admin',
    });

    const history = await db.orm.public.PartnerHistory.where({ partnerId })
      .orderBy((entry) => entry.createdAt.desc())
      .all();
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe('RELATIONSHIP_UPDATED');
    expect(history[0]?.performedBy).toBe('integration-test-admin');
    expect(history[0]?.relationshipId).toBe(relationship!.id);

    // The ended relationship is still stored (history, not deletion).
    const stillStored = await db.orm.public.PartnerRelationship.first({ id: relationship!.id });
    expect(stillStored).not.toBeNull();
    expect(stillStored?.status).toBe('ENDED');
  });

  it('publishes only active partners with active public relationships', async () => {
    const inactive = await PartnerService.createPartner({
      companyName: `Inaktiv ${RUN}`,
      description: 'Nicht öffentlich',
    });
    inactivePartnerId = inactive.id;
    await PartnerService.updatePartner(inactivePartnerId, { status: 'INACTIVE' });

    const publicPartners = await PartnerService.getPublicPartners();
    const published = publicPartners.find((entry) => entry.id === partnerId);

    expect(published).toBeDefined();
    expect(publicPartners.some((entry) => entry.id === inactivePartnerId)).toBe(false);

    // Only the public, still-active relationship is serialized.
    expect(published?.relationships.map((entry) => entry.type)).toEqual(['OFFICIAL_PARTNER']);
    expect(published?.relationships.every((entry) => entry.isPublic)).toBe(true);
    expect(published?.isFeatured).toBe(true);
  });

  it('counts active partners, featured partners and public relationships', async () => {
    const stats = await PartnerService.getPartnerStats();

    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.featured).toBeGreaterThanOrEqual(1);
    expect(stats.relationships['OFFICIAL_PARTNER']).toBeGreaterThanOrEqual(1);
    // The ended SPONSOR relationship is not part of the active statistics.
    expect(stats.relationships['TECHNICAL_PARTNER'] ?? 0).toBe(0);
  });

  it('returns the history for the admin endpoint query', async () => {
    const history = await db.orm.public.PartnerHistory.where({ partnerId })
      .include('relationship')
      .orderBy((entry) => entry.createdAt.desc())
      .all();

    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.relationship).not.toBeNull();
    expect(history[0]?.relationship?.status).toBe('ENDED');
  });
});
