/**
 * Request schemas for the advertising and partner modules (pure, no database).
 *
 * These cover the shapes an admin UI or the public form actually submits:
 * `YYYY-MM-DD` from a date input, empty strings for untouched optional fields,
 * and the enum values that exist in the emitted Prisma contract.
 */
import {
  adCampaignSchema,
  adCampaignUpdateSchema,
  adPlacementSchema,
  advertiserUpdateSchema,
  advertisingApplicationFormSchema,
  advertisingApplicationSchema,
  applicationStatusSchema,
  campaignStatsQuerySchema,
  canTransitionApplication,
  canTransitionCampaign,
  creativeSchema,
  trackingEventSchema,
} from '../advertising/validations';
import {
  partnerUpdateSchema,
  relationshipCreateSchema,
  relationshipUpdateSchema,
} from '../partner/validations';

const validApplication = {
  companyName: 'Radio Werbung GmbH',
  contactName: 'Erika Musterfrau',
  email: 'erika@example.com',
  websiteUrl: 'https://example.com',
  phone: '',
  adFormat: 'BANNER',
  placement: 'HOMEPAGE',
  desiredStartDate: '',
  desiredEndDate: '',
  description: 'Wir möchten unsere Marke im Radio bewerben.',
  desiredBudget: '5000 EUR',
  customMessage: '',
  privacyConsent: true,
};

const validCampaign = {
  advertiserId: '0197c9e2-4a3b-7c8d-9e0f-1a2b3c4d5e6f',
  name: 'Sommerkampagne',
  description: 'Banner auf der Startseite',
  placement: 'HOMEPAGE',
  format: 'BANNER',
  startDate: '2026-06-01',
  endDate: '2026-08-31',
  targetUrl: 'https://example.com/sommer',
  internalNotes: 'Interner Hinweis',
};

describe('advertising application schema', () => {
  it('accepts the form values including empty optional dates', () => {
    const parsed = advertisingApplicationSchema.parse(validApplication);
    expect(parsed.desiredStartDate).toBe('');
    expect(parsed.desiredEndDate).toBe('');
    expect(parsed.adFormat).toBe('BANNER');
    expect(parsed.placement).toBe('HOMEPAGE');
  });

  it('accepts date-input values and full ISO timestamps', () => {
    expect(
      advertisingApplicationSchema.parse({
        ...validApplication,
        desiredStartDate: '2026-06-01',
      }).desiredStartDate,
    ).toBe('2026-06-01');

    expect(
      advertisingApplicationSchema.parse({
        ...validApplication,
        desiredStartDate: '2026-06-01T10:00:00Z',
      }).desiredStartDate,
    ).toBe('2026-06-01T10:00:00Z');
  });

  it('requires consent and a sufficiently long description', () => {
    expect(
      advertisingApplicationSchema.safeParse({ ...validApplication, privacyConsent: false })
        .success,
    ).toBe(false);
    expect(
      advertisingApplicationSchema.safeParse({ ...validApplication, description: 'zu kurz' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown formats and placements', () => {
    expect(
      advertisingApplicationSchema.safeParse({ ...validApplication, placement: 'BILLBOARD' })
        .success,
    ).toBe(false);
    expect(adPlacementSchema.safeParse('DOWNLOAD_PAGE').success).toBe(true);
    expect(adPlacementSchema.safeParse('SOMEWHERE').success).toBe(false);
  });
});

describe('campaign schema', () => {
  it('accepts a campaign with date-only boundaries', () => {
    expect(adCampaignSchema.safeParse(validCampaign).success).toBe(true);
  });

  it('rejects an end date before or equal to the start date', () => {
    const parsed = adCampaignSchema.safeParse({ ...validCampaign, endDate: '2026-06-01' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['endDate']);
    }
  });

  it('rejects a non-UUID advertiser and a non-URL target', () => {
    expect(adCampaignSchema.safeParse({ ...validCampaign, advertiserId: 'abc' }).success).toBe(
      false,
    );
    expect(
      adCampaignSchema.safeParse({ ...validCampaign, targetUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
});

describe('status, tracking and query schemas', () => {
  it('only accepts membership statuses', () => {
    expect(applicationStatusSchema.safeParse('UNDER_REVIEW').success).toBe(true);
    expect(applicationStatusSchema.safeParse('DONE').success).toBe(false);
  });

  it('validates a tracking payload against the contract enums', () => {
    expect(
      trackingEventSchema.safeParse({
        campaignId: validCampaign.advertiserId,
        placement: 'DOWNLOAD_PAGE',
      }).success,
    ).toBe(true);
    expect(
      trackingEventSchema.safeParse({
        campaignId: validCampaign.advertiserId,
        placement: 'NOWHERE',
      }).success,
    ).toBe(false);
    expect(trackingEventSchema.safeParse({ campaignId: 'nope', placement: 'HOMEPAGE' }).success).toBe(
      false,
    );
  });

  it('coerces stats query dates and keeps them optional', () => {
    // The campaign id is a path segment now; the query only carries the range.
    const parsed = campaignStatsQuerySchema.parse({ startDate: '2026-06-01' });
    expect(parsed.startDate).toBeInstanceOf(Date);
    expect(parsed.endDate).toBeUndefined();
    expect(campaignStatsQuerySchema.parse({})).toEqual({
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('validates the end date of an application against its start date', () => {
    const parsed = advertisingApplicationFormSchema.safeParse({
      ...validApplication,
      desiredStartDate: '2026-08-01',
      desiredEndDate: '2026-07-01',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['desiredEndDate']);
    }

    expect(
      advertisingApplicationFormSchema.safeParse({
        ...validApplication,
        desiredStartDate: '2026-07-01',
        desiredEndDate: '2026-08-01',
      }).success,
    ).toBe(true);
  });
});

describe('admin update schemas', () => {
  it('accepts partial advertiser edits and keeps the id required', () => {
    expect(advertiserUpdateSchema.safeParse({ id: validCampaign.advertiserId }).success).toBe(true);
    expect(
      advertiserUpdateSchema.safeParse({
        id: validCampaign.advertiserId,
        companyName: 'Neuer Name',
        websiteUrl: '',
      }).success,
    ).toBe(true);
    expect(advertiserUpdateSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(
      advertiserUpdateSchema.safeParse({
        id: validCampaign.advertiserId,
        websiteUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
  });

  it('accepts campaign edits with or without dates', () => {
    expect(
      adCampaignUpdateSchema.safeParse({ id: validCampaign.advertiserId, name: 'Neu' }).success,
    ).toBe(true);
    expect(
      adCampaignUpdateSchema.safeParse({
        id: validCampaign.advertiserId,
        startDate: '2026-06-01',
        endDate: '2026-07-01',
      }).success,
    ).toBe(true);
    expect(
      adCampaignUpdateSchema.safeParse({
        id: validCampaign.advertiserId,
        startDate: '2026-07-01',
        endDate: '2026-06-01',
      }).success,
    ).toBe(false);
  });

  it('validates creative metadata', () => {
    const creative = {
      campaignId: validCampaign.advertiserId,
      imageUrl: 'https://cdn.example.com/banner.png',
      altText: 'Banner',
      width: 728,
      height: 90,
      fileSize: 48_000,
      contentType: 'image/png',
    };

    expect(creativeSchema.safeParse(creative).success).toBe(true);
    expect(creativeSchema.safeParse({ ...creative, contentType: 'text/html' }).success).toBe(false);
    expect(creativeSchema.safeParse({ ...creative, width: 0 }).success).toBe(false);
    expect(creativeSchema.safeParse({ ...creative, imageUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });
});

describe('status machines', () => {
  it('keeps a reviewed application reviewable', () => {
    expect(canTransitionApplication('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionApplication('UNDER_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransitionApplication('UNDER_REVIEW', 'PENDING')).toBe(true);
    expect(canTransitionApplication('APPROVED', 'PENDING')).toBe(false);
  });

  it('refuses to reactivate a completed campaign or skip the review', () => {
    expect(canTransitionCampaign('DRAFT', 'ACTIVE')).toBe(true);
    expect(canTransitionCampaign('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionCampaign('PAUSED', 'ACTIVE')).toBe(true);
    expect(canTransitionCampaign('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransitionCampaign('DRAFT', 'COMPLETED')).toBe(false);
  });
});

describe('partner schemas', () => {
  it('converts date inputs into Temporal instants at the boundary', () => {
    const parsed = relationshipCreateSchema.parse({
      partnerId: '0197c9e2-4a3b-7c8d-9e0f-1a2b3c4d5e6f',
      type: 'SPONSOR',
      startDate: '2024-05-01',
      isPublic: true,
    });

    expect(parsed.startDate.constructor.name).toBe('Instant');
    expect(parsed.startDate.toString()).toBe('2024-05-01T00:00:00Z');
    expect(parsed.isPublic).toBe(true);
    expect(parsed.endDate ?? null).toBeNull();
  });

  it('rejects unknown relationship types and statuses', () => {
    const base = {
      partnerId: '0197c9e2-4a3b-7c8d-9e0f-1a2b3c4d5e6f',
      startDate: '2024-05-01',
    };
    expect(relationshipCreateSchema.safeParse({ ...base, type: 'BEST_FRIEND' }).success).toBe(false);
    expect(
      relationshipUpdateSchema.safeParse({
        id: base.partnerId,
        status: 'DELETED',
      }).success,
    ).toBe(false);
  });

  it('requires a UUID id for updates', () => {
    expect(partnerUpdateSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(partnerUpdateSchema.safeParse({ id: '0197c9e2-4a3b-7c8d-9e0f-1a2b3c4d5e6f' }).success).toBe(
      true,
    );
  });
});
