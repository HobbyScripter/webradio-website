/**
 * Advertising service — Prisma 8 (contract-first ORM).
 *
 * API notes that drove this implementation (verified against the installed
 * `@prisma/orm-postgres` 8.0.0-rc.27 types and the packaged Prisma 8 skill):
 *
 *   - inserts are `collection.create(...)` (there is no `.insert()`),
 *   - single rows are `collection.first(...)` (`.all()` returns the whole set),
 *   - `update(...)` already resolves the changed row (`Promise<Row | null>`),
 *     so `.all().first()` does not exist on its result,
 *   - `DateTime` maps to `Temporal.Instant`, not `Date`,
 *   - predicates compose with `and(...)` from `@prisma/orm-postgres/orm-client`,
 *     there is no `.and()` method on a field expression.
 *
 * The service keeps its original public surface so the route handlers and the
 * admin UI did not need a new data contract.
 */
import 'temporal-polyfill/global';
import { and } from '@prisma/orm-postgres/orm-client';
import { db } from '@/lib/db';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { localizeRecords } from '@/lib/content-translations';
import { RuleError } from '@/lib/rule-error';
import type { Models } from '../../../prisma/contract.d';
import {
  adCampaignSchema,
  adCampaignUpdateSchema,
  adPlacementSchema,
  advertiserSchema,
  advertiserUpdateSchema,
  advertisingApplicationSchema,
  canTransitionApplication,
  canTransitionCampaign,
  creativeSchema,
  type AdCampaignInput,
  type AdCampaignUpdateInput,
  type AdvertiserInput,
  type AdvertiserUpdateInput,
  type AdvertisingApplicationInput,
  type CreativeInput,
} from './validations';

export type ApplicationStatus = Models.public_AdvertisingApplication['status'];
export type AdvertiserStatus = Models.public_Advertiser['status'];
export type AdCampaignStatus = Models.public_AdCampaign['status'];
export type AdPlacement = Models.public_AdImpression['placement'];

/**
 * Convert an ISO date/datetime string (or a `Date`) into the `Temporal.Instant`
 * the contract requires for every `DateTime` column.
 */
export function toInstant(value: string | Date): Temporal.Instant {
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Ungültiges Datum');
  }
  return Temporal.Instant.from(parsed.toISOString());
}

/** UTC midnight of the current day: the aggregation key for impressions/clicks. */
export function utcDayStart(now: Date = new Date()): Temporal.Instant {
  return Temporal.Instant.from(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export class AdvertisingService {
  /**
   * Create a new advertising application
   */
  static async createApplication(data: AdvertisingApplicationInput) {
    const validated = advertisingApplicationSchema.parse(data);

    // Check honeypot (if added later)
    // if (validated.honeypot) throw new Error('Spam detected');

    return db.orm.public.AdvertisingApplication.create({
      companyName: validated.companyName,
      contactName: validated.contactName,
      email: validated.email,
      websiteUrl: validated.websiteUrl || null,
      phone: validated.phone || null,
      adFormat: validated.adFormat,
      placement: validated.placement,
      desiredStartDate: validated.desiredStartDate
        ? toInstant(validated.desiredStartDate)
        : null,
      desiredEndDate: validated.desiredEndDate ? toInstant(validated.desiredEndDate) : null,
      description: validated.description,
      desiredBudget: validated.desiredBudget || null,
      customMessage: validated.customMessage || null,
      status: 'PENDING',
    });
  }

  /**
   * Get all applications (admin only)
   */
  static async getApplications(filters?: { status?: ApplicationStatus }) {
    if (filters?.status) {
      return db.orm.public.AdvertisingApplication.where({ status: filters.status })
        .orderBy((a) => a.createdAt.desc())
        .all();
    }
    return db.orm.public.AdvertisingApplication.orderBy((a) => a.createdAt.desc()).all();
  }

  /**
   * Get application by ID (admin only)
   */
  static async getApplicationById(id: string) {
    return db.orm.public.AdvertisingApplication.first({ id });
  }

  /**
   * Update application status (admin only)
   */
  static async updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    rejectionReason?: string,
    internalNotes?: string,
    reviewedById?: string,
  ) {
    const existing = await db.orm.public.AdvertisingApplication.first({ id });
    if (!existing) {
      return null;
    }

    if (!canTransitionApplication(existing.status, status)) {
      throw new RuleError(
        `Statuswechsel ${existing.status} → ${status} ist für Bewerbungen nicht erlaubt.`,
      );
    }

    // Only fields that were actually sent are written: approving an application
    // must not silently delete the internal notes, and editing notes must not
    // reset the rejection reason.
    return db.orm.public.AdvertisingApplication.where({ id }).update({
      status,
      ...(rejectionReason !== undefined ? { rejectionReason: rejectionReason || null } : {}),
      ...(internalNotes !== undefined ? { internalNotes: internalNotes || null } : {}),
      ...(reviewedById ? { reviewedById } : {}),
      reviewedAt: Temporal.Now.instant(),
    });
  }

  /** Internal notes without touching the review state. */
  static async updateApplicationNotes(id: string, internalNotes: string) {
    return db.orm.public.AdvertisingApplication.where({ id }).update({
      internalNotes: internalNotes || null,
    });
  }

  /**
   * Create advertiser from approved application (admin only)
   */
  static async createAdvertiser(data: AdvertiserInput) {
    const validated = advertiserSchema.parse(data);

    return db.orm.public.Advertiser.create({
      companyName: validated.companyName,
      contactName: validated.contactName,
      email: validated.email,
      websiteUrl: validated.websiteUrl || null,
      description: validated.description || null,
      status: 'ACTIVE',
    });
  }

  /**
   * Advertisers plus their campaign count.
   *
   * The contract has no reverse `Advertiser.campaigns` relation, so the count is
   * derived from the campaign rows themselves — one extra read, no schema change
   * (finding D11).
   */
  static async getAdvertisersWithCampaignCounts(filters?: { status?: AdvertiserStatus }) {
    const [advertisers, campaigns] = await Promise.all([
      AdvertisingService.getAdvertisers(filters),
      db.orm.public.AdCampaign.all(),
    ]);

    const counts = new Map<string, number>();
    for (const campaign of campaigns) {
      if (campaign.advertiserId) {
        counts.set(campaign.advertiserId, (counts.get(campaign.advertiserId) ?? 0) + 1);
      }
    }

    return advertisers.map((advertiser) => ({
      ...advertiser,
      campaignCount: counts.get(advertiser.id) ?? 0,
    }));
  }

  /**
   * Get all advertisers (admin only)
   */
  static async getAdvertisers(filters?: { status?: AdvertiserStatus }) {
    if (filters?.status) {
      return db.orm.public.Advertiser.where({ status: filters.status })
        .orderBy((a) => a.createdAt.desc())
        .all();
    }
    return db.orm.public.Advertiser.orderBy((a) => a.createdAt.desc()).all();
  }

  /**
   * Update advertiser status (admin only)
   */
  static async updateAdvertiserStatus(id: string, status: AdvertiserStatus) {
    return db.orm.public.Advertiser.where({ id }).update({ status });
  }

  /**
   * Update advertiser details and/or status (admin only).
   * Empty optional strings are stored as NULL, never as ''.
   */
  static async updateAdvertiser(data: AdvertiserUpdateInput) {
    const validated = advertiserUpdateSchema.parse(data);

    return db.orm.public.Advertiser.where({ id: validated.id }).update({
      ...(validated.status ? { status: validated.status } : {}),
      ...(validated.companyName ? { companyName: validated.companyName } : {}),
      ...(validated.contactName ? { contactName: validated.contactName } : {}),
      ...(validated.email ? { email: validated.email } : {}),
      ...(validated.websiteUrl !== undefined
        ? { websiteUrl: validated.websiteUrl || null }
        : {}),
      ...(validated.logoUrl !== undefined ? { logoUrl: validated.logoUrl || null } : {}),
      ...(validated.description !== undefined
        ? { description: validated.description || null }
        : {}),
    });
  }

  /**
   * Create campaign (admin only)
   *
   * `advertiserId` is the advertiser relation. `partnerId` stays null here: it
   * is the separate partner-portal path on the same campaign table.
   */
  static async createCampaign(data: AdCampaignInput) {
    const validated = adCampaignSchema.parse(data);

    const startDate = toInstant(validated.startDate);
    const endDate = toInstant(validated.endDate);

    if (Temporal.Instant.compare(startDate, endDate) >= 0) {
      throw new RuleError('Enddatum muss nach Startdatum liegen');
    }

    return db.orm.public.AdCampaign.create({
      advertiserId: validated.advertiserId,
      partnerId: validated.partnerId || null,
      name: validated.name,
      description: validated.description || null,
      placement: validated.placement,
      format: validated.format,
      startDate,
      endDate,
      targetUrl: validated.targetUrl,
      status: 'DRAFT',
      internalNotes: validated.internalNotes || null,
    });
  }

  /**
   * Update a campaign: content, assignment and status in one operation.
   *
   * Status changes go through the explicit transition table, so a completed
   * campaign cannot be reactivated and the review step cannot be skipped.
   */
  static async updateCampaign(data: AdCampaignUpdateInput) {
    const validated = adCampaignUpdateSchema.parse(data);

    const existing = await db.orm.public.AdCampaign.first({ id: validated.id });
    if (!existing) {
      return null;
    }

    if (validated.status && !canTransitionCampaign(existing.status, validated.status)) {
      throw new RuleError(
        `Statuswechsel ${existing.status} → ${validated.status} ist nicht erlaubt.`,
      );
    }

    const startDate = validated.startDate ? toInstant(validated.startDate) : existing.startDate;
    const endDate = validated.endDate ? toInstant(validated.endDate) : existing.endDate;

    if (Temporal.Instant.compare(startDate, endDate) >= 0) {
      throw new RuleError('Enddatum muss nach Startdatum liegen');
    }

    return db.orm.public.AdCampaign.where({ id: validated.id }).update({
      ...(validated.status ? { status: validated.status } : {}),
      ...(validated.advertiserId ? { advertiserId: validated.advertiserId } : {}),
      ...(validated.partnerId !== undefined ? { partnerId: validated.partnerId } : {}),
      ...(validated.name ? { name: validated.name } : {}),
      ...(validated.description !== undefined
        ? { description: validated.description || null }
        : {}),
      ...(validated.placement ? { placement: validated.placement } : {}),
      ...(validated.format ? { format: validated.format } : {}),
      ...(validated.startDate ? { startDate } : {}),
      ...(validated.endDate ? { endDate } : {}),
      ...(validated.targetUrl ? { targetUrl: validated.targetUrl } : {}),
      ...(validated.internalNotes !== undefined
        ? { internalNotes: validated.internalNotes || null }
        : {}),
    });
  }

  static async getCampaigns(filters?: {
    status?: AdCampaignStatus;
    advertiserId?: string;
  }) {
    if (filters?.status && filters?.advertiserId) {
      return db.orm.public.AdCampaign.where({
        status: filters.status,
        advertiserId: filters.advertiserId,
      })
        .include('advertiser')
        .orderBy((c) => c.createdAt.desc())
        .all();
    }
    if (filters?.status) {
      return db.orm.public.AdCampaign.where({ status: filters.status })
        .include('advertiser')
        .orderBy((c) => c.createdAt.desc())
        .all();
    }
    if (filters?.advertiserId) {
      return db.orm.public.AdCampaign.where({ advertiserId: filters.advertiserId })
        .include('advertiser')
        .orderBy((c) => c.createdAt.desc())
        .all();
    }
    return db.orm.public.AdCampaign.include('advertiser')
      .orderBy((c) => c.createdAt.desc())
      .all();
  }

  static async updateCampaignStatus(id: string, status: AdCampaignStatus) {
    return db.orm.public.AdCampaign.where({ id }).update({ status });
  }

  /**
   * Campaigns that are live right now for a placement.
   */
  static async getActiveCampaigns(placement: AdPlacement, locale: Locale = DEFAULT_LOCALE) {
    const now = Temporal.Now.instant();

    const campaigns = await db.orm.public.AdCampaign.where((c) =>
      and(
        c.placement.eq(placement),
        c.status.eq('ACTIVE'),
        c.startDate.lte(now),
        c.endDate.gte(now),
      ),
    ).all();

    // `name` and `description` only; target URL, dates and internal notes are
    // not translatable fields and keep their stored values.
    return localizeRecords('AdCampaign', locale, campaigns);
  }

  static async recordImpression(campaignId: string, placement: AdPlacement) {
    const day = utcDayStart();

    const existing = await db.orm.public.AdImpression.where({
      campaignId,
      placement,
      day,
    }).first();

    if (existing) {
      await db.orm.public.AdImpression.where({ id: existing.id }).update({
        count: existing.count + 1,
      });
    } else {
      await db.orm.public.AdImpression.create({ campaignId, placement, day, count: 1 });
    }
  }

  static async recordClick(campaignId: string, placement: AdPlacement) {
    const day = utcDayStart();

    const existing = await db.orm.public.AdClick.where({
      campaignId,
      placement,
      day,
    }).first();

    if (existing) {
      await db.orm.public.AdClick.where({ id: existing.id }).update({
        count: existing.count + 1,
      });
    } else {
      await db.orm.public.AdClick.create({ campaignId, placement, day, count: 1 });
    }
  }

  /**
   * Creatives, optionally for one campaign (admin only).
   */
  static async getCreatives(campaignId?: string) {
    if (campaignId) {
      return db.orm.public.AdCreative.where({ campaignId })
        .orderBy((creative) => creative.createdAt.desc())
        .all();
    }
    return db.orm.public.AdCreative.orderBy((creative) => creative.createdAt.desc()).all();
  }

  static async createCreative(data: CreativeInput) {
    const validated = creativeSchema.parse(data);

    return db.orm.public.AdCreative.create({
      campaignId: validated.campaignId,
      imageUrl: validated.imageUrl,
      altText: validated.altText || null,
      width: validated.width,
      height: validated.height,
      fileSize: validated.fileSize,
      contentType: validated.contentType,
    });
  }

  static async deleteCreative(id: string) {
    return db.orm.public.AdCreative.where({ id }).delete();
  }

  /**
   * Placement overview: how many campaigns and creatives exist per placement,
   * and how many of those campaigns are live right now.
   */
  static async getPlacementOverview() {
    const [campaigns, creatives] = await Promise.all([
      db.orm.public.AdCampaign.all(),
      db.orm.public.AdCreative.all(),
    ]);

    const now = Temporal.Now.instant();

    return adPlacementSchema.options.map((placement) => {
      const inPlacement = campaigns.filter((campaign) => campaign.placement === placement);
      const ids = new Set(inPlacement.map((campaign) => campaign.id));
      const live = inPlacement.filter(
        (campaign) =>
          campaign.status === 'ACTIVE' &&
          Temporal.Instant.compare(campaign.startDate, now) <= 0 &&
          Temporal.Instant.compare(campaign.endDate, now) >= 0,
      );

      return {
        placement,
        totalCampaigns: inPlacement.length,
        activeCampaigns: live.length,
        creativeCount: creatives.filter((creative) => ids.has(creative.campaignId)).length,
      };
    });
  }

  static async getCampaignStats(campaignId: string, startDate?: Date, endDate?: Date) {
    const start = startDate ? toInstant(startDate) : null;
    const end = endDate ? toInstant(endDate) : null;

    let impressionQuery = db.orm.public.AdImpression.where({ campaignId });
    let clickQuery = db.orm.public.AdClick.where({ campaignId });

    if (start) {
      impressionQuery = impressionQuery.where((i) => i.day.gte(start));
      clickQuery = clickQuery.where((c) => c.day.gte(start));
    }
    if (end) {
      impressionQuery = impressionQuery.where((i) => i.day.lte(end));
      clickQuery = clickQuery.where((c) => c.day.lte(end));
    }

    const impressions = await impressionQuery.all();
    const clicks = await clickQuery.all();

    const totalImpressions = impressions.reduce((sum, impression) => sum + impression.count, 0);
    const totalClicks = clicks.reduce((sum, click) => sum + click.count, 0);

    return {
      totalImpressions,
      totalClicks,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    };
  }
}
