import { z } from 'zod';

/**
 * Contract value unions. They are derived from the schemas instead of declared
 * as TS enums: the Prisma contract stores string literals, and a nominal enum
 * would make a parsed value unusable as a contract value.
 */
export const adFormatSchema = z.enum(['BANNER', 'SPONSOR_CARD', 'LOGO_LINK', 'CUSTOM']);
export type AdFormat = z.infer<typeof adFormatSchema>;

export const adPlacementSchema = z.enum(['HOMEPAGE', 'DOWNLOAD_PAGE', 'PUBLIC_PAGES']);
export type AdPlacementType = z.infer<typeof adPlacementSchema>;

/**
 * A `<input type="date">` submits `YYYY-MM-DD`, while an API client may send a
 * full ISO timestamp. Both are ISO-8601, so both are accepted; anything else is
 * still rejected.
 */
const dateOrDateTime = z.union([z.iso.datetime(), z.iso.date()], 'Ungültiges Datum');

/**
 * Only absolute HTTP(S) URLs are accepted. `z.url()` alone also accepts
 * `javascript:` and other schemes, which must never reach an ad link or a
 * partner logo (`href`/`src` injection).
 */
function httpUrl(message: string) {
  return z
    .string()
    .url(message)
    .refine((value) => /^https?:\/\//i.test(value), message);
}

export const applicationStatusSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

export const advertiserStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);

export const adCampaignStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'REJECTED',
]);

export const advertisingApplicationSchema = z.object({
  companyName: z.string().min(2, 'Unternehmensname muss mindestens 2 Zeichen haben').max(100),
  contactName: z.string().min(2, 'Ansprechpartner muss mindestens 2 Zeichen haben').max(100),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  websiteUrl: httpUrl('Ungültige URL').optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  adFormat: adFormatSchema,
  placement: adPlacementSchema,
  desiredStartDate: dateOrDateTime.optional().or(z.literal('')),
  desiredEndDate: dateOrDateTime.optional().or(z.literal('')),
  description: z.string().min(10, 'Beschreibung muss mindestens 10 Zeichen haben').max(2000),
  desiredBudget: z.string().max(100).optional(),
  customMessage: z.string().max(2000).optional(),
  privacyConsent: z.literal(true),
});

export type AdvertisingApplicationInput = z.infer<typeof advertisingApplicationSchema>;

/** The application schema plus the checks that need both dates at once. */
export const advertisingApplicationFormSchema = advertisingApplicationSchema.refine(
  (value) =>
    !value.desiredStartDate ||
    !value.desiredEndDate ||
    new Date(value.desiredStartDate) <= new Date(value.desiredEndDate),
  {
    message: 'Das Enddatum darf nicht vor dem Startdatum liegen',
    path: ['desiredEndDate'],
  },
);

export const adCampaignSchema = z
  .object({
    advertiserId: z.string().uuid('Ungültige Werbepartner-ID'),
    partnerId: z.string().uuid('Ungültige Partner-ID').optional().nullable(),
    name: z.string().min(2, 'Kampagnenname muss mindestens 2 Zeichen haben').max(100),
    description: z.string().max(500).optional(),
    placement: adPlacementSchema,
    format: adFormatSchema,
    startDate: dateOrDateTime,
    endDate: dateOrDateTime,
    targetUrl: httpUrl('Ungültige Ziel-URL'),
    internalNotes: z.string().max(2000).optional(),
  })
  .refine((value) => new Date(value.startDate) < new Date(value.endDate), {
    message: 'Enddatum muss nach Startdatum liegen',
    path: ['endDate'],
  });

export type AdCampaignInput = z.infer<typeof adCampaignSchema>;

export const advertiserSchema = z.object({
  companyName: z.string().min(2, 'Unternehmensname muss mindestens 2 Zeichen haben').max(100),
  contactName: z.string().min(2, 'Ansprechpartner muss mindestens 2 Zeichen haben').max(100),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  websiteUrl: httpUrl('Ungültige URL').optional().or(z.literal('')),
  logoUrl: httpUrl('Ungültige URL').optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
});

export type AdvertiserInput = z.infer<typeof advertiserSchema>;

export const advertiserUpdateSchema = advertiserSchema.partial().extend({
  id: z.string().uuid('Ungültige Werbepartner-ID'),
  status: advertiserStatusSchema.optional(),
});

export type AdvertiserUpdateInput = z.infer<typeof advertiserUpdateSchema>;

export const adCampaignUpdateSchema = z
  .object({
    id: z.string().uuid('Ungültige Kampagnen-ID'),
    status: adCampaignStatusSchema.optional(),
    advertiserId: z.string().uuid('Ungültige Werbepartner-ID').optional(),
    partnerId: z.string().uuid('Ungültige Partner-ID').optional().nullable(),
    name: z.string().min(2, 'Kampagnenname muss mindestens 2 Zeichen haben').max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    placement: adPlacementSchema.optional(),
    format: adFormatSchema.optional(),
    startDate: dateOrDateTime.optional(),
    endDate: dateOrDateTime.optional(),
    targetUrl: httpUrl('Ungültige Ziel-URL').optional(),
    internalNotes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || new Date(value.startDate) < new Date(value.endDate),
    { message: 'Enddatum muss nach Startdatum liegen', path: ['endDate'] },
  );

export type AdCampaignUpdateInput = z.infer<typeof adCampaignUpdateSchema>;

export const applicationReviewSchema = z.object({
  id: z.string().uuid('Ungültige Bewerbungs-ID'),
  status: applicationStatusSchema,
  rejectionReason: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
});

export type ApplicationReviewInput = z.infer<typeof applicationReviewSchema>;

/** Internal notes only: editing them must not change the review state. */
export const applicationNotesSchema = z.object({
  id: z.string().uuid('Ungültige Bewerbungs-ID'),
  internalNotes: z.string().max(2000),
});

export const advertiserStatusUpdateSchema = z.object({
  id: z.string().uuid('Ungültige Werbepartner-ID'),
  status: advertiserStatusSchema,
});

export const campaignStatusUpdateSchema = z.object({
  id: z.string().uuid('Ungültige Kampagnen-ID'),
  status: adCampaignStatusSchema,
});

/** Campaign statistics: the campaign id is the route segment, not a query. */
export const campaignStatsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const creativeSchema = z.object({
  campaignId: z.string().uuid('Ungültige Kampagnen-ID'),
  imageUrl: httpUrl('Ungültige Bild-URL'),
  altText: z.string().max(200).optional().or(z.literal('')),
  width: z.coerce.number().int().min(1, 'Breite muss positiv sein').max(10000),
  height: z.coerce.number().int().min(1, 'Höhe muss positiv sein').max(10000),
  fileSize: z.coerce.number().int().min(0).max(50_000_000),
  contentType: z
    .string()
    .min(3, 'Content-Type fehlt')
    .max(100)
    .refine((value) => value.startsWith('image/'), 'Nur Bild-Content-Types sind erlaubt'),
});

export type CreativeInput = z.infer<typeof creativeSchema>;

export const creativeQuerySchema = z.object({
  campaignId: z.string().uuid('Ungültige Kampagnen-ID').optional(),
});

export const trackingEventSchema = z.object({
  campaignId: z.string().uuid('Ungültige Kampagnen-ID'),
  placement: adPlacementSchema,
});

export type TrackingEventInput = z.infer<typeof trackingEventSchema>;

/**
 * Status machine for campaigns. Transitions are explicit so an accidental
 * PATCH cannot move a completed campaign back to ACTIVE or skip the review.
 */
export const CAMPAIGN_STATUS_TRANSITIONS: Record<
  z.infer<typeof adCampaignStatusSchema>,
  readonly z.infer<typeof adCampaignStatusSchema>[]
> = {
  DRAFT: ['PENDING_REVIEW', 'SCHEDULED', 'ACTIVE', 'REJECTED'],
  PENDING_REVIEW: ['SCHEDULED', 'ACTIVE', 'REJECTED'],
  SCHEDULED: ['ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE', 'COMPLETED'],
  COMPLETED: [],
  REJECTED: ['DRAFT'],
};

export function canTransitionCampaign(
  from: z.infer<typeof adCampaignStatusSchema>,
  to: z.infer<typeof adCampaignStatusSchema>,
): boolean {
  return from === to || CAMPAIGN_STATUS_TRANSITIONS[from].includes(to);
}

/** Status machine for applications; a reviewed application stays reviewable. */
export const APPLICATION_STATUS_TRANSITIONS: Record<
  z.infer<typeof applicationStatusSchema>,
  readonly z.infer<typeof applicationStatusSchema>[]
> = {
  PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['REJECTED'],
  REJECTED: ['UNDER_REVIEW'],
  WITHDRAWN: ['UNDER_REVIEW'],
};

export function canTransitionApplication(
  from: z.infer<typeof applicationStatusSchema>,
  to: z.infer<typeof applicationStatusSchema>,
): boolean {
  return from === to || APPLICATION_STATUS_TRANSITIONS[from].includes(to);
}
