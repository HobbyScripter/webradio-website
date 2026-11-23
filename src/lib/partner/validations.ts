/**
 * Request validation for the partner portal.
 *
 * Prisma 8 stores `DateTime` as `Temporal.Instant`, so the date fields accept
 * the ISO forms a browser actually sends (`YYYY-MM-DD` from a date input or a
 * full ISO timestamp) and transform once, at the HTTP boundary. Downstream
 * code therefore only ever sees validated, typed values.
 */
import 'temporal-polyfill/global';
import { z } from 'zod';

const instantInput = z
  .coerce.date()
  .transform((value) => Temporal.Instant.from(value.toISOString()));

/** Absolute HTTP(S) only: a partner link/logo must never carry another scheme. */
const httpUrl = z
  .string()
  .url('Ungültige URL')
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), 'Ungültige URL');

const optionalUrl = httpUrl.optional().or(z.literal(''));

export const partnerStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const partnerRelationshipTypeSchema = z.enum([
  'OFFICIAL_PARTNER',
  'TECHNICAL_PARTNER',
  'SPONSOR',
  'MEDIA_PARTNER',
  'STRATEGIC_PARTNER',
]);

export const partnerRelationshipStatusSchema = z.enum(['ACTIVE', 'ENDED', 'PAUSED']);

export const partnerInputSchema = z.object({
  companyName: z.string().min(2, 'Unternehmensname muss mindestens 2 Zeichen haben').max(100),
  description: z.string().max(2000).optional(),
  websiteUrl: optionalUrl,
  logoUrl: optionalUrl,
  isFeatured: z.boolean().optional(),
});

export const partnerUpdateSchema = partnerInputSchema.partial().extend({
  id: z.string().uuid('Ungültige Partner-ID'),
  status: partnerStatusSchema.optional(),
});

export const relationshipCreateSchema = z.object({
  partnerId: z.string().uuid('Ungültige Partner-ID'),
  type: partnerRelationshipTypeSchema,
  startDate: instantInput,
  endDate: instantInput.optional().nullable(),
  isPublic: z.boolean().optional(),
  status: partnerRelationshipStatusSchema.optional(),
});

export const relationshipUpdateSchema = z.object({
  id: z.string().uuid('Ungültige Beziehungs-ID'),
  status: partnerRelationshipStatusSchema.optional(),
  endDate: instantInput.optional().nullable(),
  isPublic: z.boolean().optional(),
});

export type PartnerInput = z.infer<typeof partnerInputSchema>;
export type PartnerUpdateInput = z.infer<typeof partnerUpdateSchema>;
export type RelationshipCreateInput = z.infer<typeof relationshipCreateSchema>;
export type RelationshipUpdateInput = z.infer<typeof relationshipUpdateSchema>;
