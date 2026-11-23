/**
 * Partner portal service — Prisma 8 (contract-first ORM).
 *
 * Prisma 8 differences applied here:
 *   - `collection.create(...)` instead of `.insert(...)`,
 *   - `update(...)` resolves the changed row itself, so `.all().first()` is gone,
 *   - `DateTime` is `Temporal.Instant`,
 *   - `count()` is an aggregate projection, not a collection terminal,
 *   - boolean columns cannot be ordered by (`.desc()` does not exist on
 *     `pg/bool@1`), so "featured first" is applied to the fetched rows.
 */
import 'temporal-polyfill/global';
import { db } from '@/lib/db';
import type { Models } from '../../../prisma/contract.d';
import { calculateDuration, type DurationDate } from './duration';

export type PartnerStatus = Models.public_Partner['status'];
export type PartnerRecord = Models.public_Partner;
export type PartnerRelationshipType = Models.public_PartnerRelationship['type'];
export type PartnerRelationshipStatus = Models.public_PartnerRelationship['status'];

export type PartnerInput = {
  companyName: string;
  description?: string;
  websiteUrl?: string;
  logoUrl?: string;
  isFeatured?: boolean;
};

export type PartnerChanges = Partial<{
  companyName: string;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
  status: PartnerStatus;
}>;

export type RelationshipInput = {
  partnerId: string;
  type: PartnerRelationshipType;
  startDate: Temporal.Instant;
  endDate?: Temporal.Instant | null;
  isPublic?: boolean;
  status?: PartnerRelationshipStatus;
};

export type RelationshipChanges = {
  status?: PartnerRelationshipStatus;
  endDate?: Temporal.Instant | null;
  isPublic?: boolean;
};

export type HistoryInput = {
  partnerId: string;
  relationshipId?: string | null;
  action: string;
  details?: string | null;
  performedBy?: string | null;
};

export class PartnerService {
  /**
   * Calculate partnership duration (kept for existing callers; the formatting
   * itself lives in the pure `./duration` module).
   */
  static calculateDuration(startDate: DurationDate, endDate?: DurationDate | null) {
    return calculateDuration(startDate, endDate);
  }

  /**
   * Create partner
   */
  static async createPartner(data: PartnerInput) {
    return db.orm.public.Partner.create({
      companyName: data.companyName,
      description: data.description || null,
      websiteUrl: data.websiteUrl || null,
      logoUrl: data.logoUrl || null,
      isFeatured: data.isFeatured ?? false,
    });
  }

  /**
   * Update partner
   */
  static async updatePartner(id: string, data: PartnerChanges) {
    // An emptied optional field means "not set", never an empty string.
    const normalized: PartnerChanges = {
      ...data,
      ...(data.websiteUrl !== undefined ? { websiteUrl: data.websiteUrl || null } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl || null } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
    };

    return db.orm.public.Partner.where({ id }).update(normalized);
  }

  /**
   * Get all partners (admin)
   */
  static async getPartners(filters?: { status?: PartnerStatus }) {
    const withRelationships = () =>
      db.orm.public.Partner.include('relationships', (relationships) =>
        relationships.orderBy((r) => r.startDate.desc()),
      );

    if (filters?.status) {
      return db.orm.public.Partner.where({ status: filters.status })
        .include('relationships', (relationships) =>
          relationships.orderBy((r) => r.startDate.desc()),
        )
        .orderBy((p) => p.createdAt.desc())
        .all();
    }

    return withRelationships().orderBy((p) => p.createdAt.desc()).all();
  }

  /**
   * Get public partners
   *
   * Only active partners are listed and only their active, explicitly public
   * relationships are included — the internal ones never reach the public page.
   * Featured partners come first; a boolean column cannot be ordered by in
   * Prisma 8, so the fetched rows are ordered in memory (stable sort keeps the
   * company-name order inside both groups).
   */
  static async getPublicPartners() {
    const partners = await db.orm.public.Partner.where({ status: 'ACTIVE' })
      .include('relationships', (relationships) =>
        relationships
          .where({ status: 'ACTIVE', isPublic: true })
          .orderBy((r) => r.startDate.desc()),
      )
      .orderBy((p) => p.companyName.asc())
      .all();

    return partners.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
  }

  /**
   * Add relationship
   */
  static async addRelationship(data: RelationshipInput) {
    return db.orm.public.PartnerRelationship.create({
      partnerId: data.partnerId,
      type: data.type,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      isPublic: data.isPublic ?? false,
      status: data.status ?? 'ACTIVE',
    });
  }

  /**
   * Update relationship
   */
  static async updateRelationship(id: string, data: RelationshipChanges) {
    return db.orm.public.PartnerRelationship.where({ id }).update(data);
  }

  /**
   * Record history
   */
  static async recordHistory(data: HistoryInput) {
    return db.orm.public.PartnerHistory.create({
      partnerId: data.partnerId,
      relationshipId: data.relationshipId ?? null,
      action: data.action,
      details: data.details ?? null,
      performedBy: data.performedBy ?? null,
    });
  }

  /**
   * Get partner statistics
   */
  static async getPartnerStats() {
    const [total, featured, relationships] = await Promise.all([
      db.orm.public.Partner.where({ status: 'ACTIVE' }).aggregate((aggregate) => ({
        total: aggregate.count(),
      })),
      db.orm.public.Partner.where({ status: 'ACTIVE', isFeatured: true }).aggregate(
        (aggregate) => ({ featured: aggregate.count() }),
      ),
      db.orm.public.PartnerRelationship.where({ status: 'ACTIVE', isPublic: true }).all(),
    ]);

    const relationshipCounts = relationships.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.type] = (acc[entry.type] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total: total.total,
      featured: featured.featured,
      relationships: relationshipCounts,
    };
  }
}
