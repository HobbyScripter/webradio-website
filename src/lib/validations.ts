/**
 * Zod Validation Schemas
 *
 * Centralised schema definitions for all API endpoints and form validation.
 * These schemas serve as the single source of truth for input validation.
 *
 * Every API route MUST validate its input through one of these schemas
 * before touching the database. See docs/SECURITY.md.
 */
import { z } from 'zod';
import { WEBRADIO_PRODUCT } from './product';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .email('Please enter a valid email address')
  .toLowerCase()
  .trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters');

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens');

export const urlSchema = z.url();

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    name: z.string().min(1, 'Name is required').max(100).trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

/** 32 random bytes, base64url encoded. */
export const authTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid token format');

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z
  .object({
    token: authTokenSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const emailVerificationSchema = z.object({
  token: authTokenSchema,
});

// ---------------------------------------------------------------------------
// Developer Profile schemas
// ---------------------------------------------------------------------------

export const developerProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100).trim(),
  bio: z.string().max(1000).trim().optional(),
  githubUrl: urlSchema.optional(),
  websiteUrl: urlSchema.optional(),
});

// ---------------------------------------------------------------------------
// Plugin schemas
// ---------------------------------------------------------------------------

// `product` is a literal, not a free string. Submission endpoints must pass
// this schema; the database has the same one-value enum as a second barrier.
export const productSchema = z.literal(WEBRADIO_PRODUCT).default(WEBRADIO_PRODUCT);

export const pluginCreateSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1, 'Plugin name is required').max(100).trim(),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000).trim(),
  product: productSchema,
});

export const pluginVersionSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semver format (e.g., 1.0.0)'),
  description: z.string().max(1000).trim().optional(),
  fileUrl: urlSchema,
  fileSize: z.number().int().positive(),
  checksum: z.string().min(1),
  minWebradioVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
  maxWebradioVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
});

// ---------------------------------------------------------------------------
// Theme schemas
// ---------------------------------------------------------------------------

export const themeCreateSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1, 'Theme name is required').max(100).trim(),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000).trim(),
  product: productSchema,
});

// ---------------------------------------------------------------------------
// Release schemas
// ---------------------------------------------------------------------------

export const releaseCreateSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semver format'),
  title: z.string().min(1, 'Release title is required').max(200).trim(),
  description: z.string().min(1, 'Release description is required').max(5000).trim(),
  product: productSchema,
  downloadUrl: urlSchema.optional(),
  fileSize: z.number().int().positive().optional(),
  checksum: z.string().optional(),
});

// ---------------------------------------------------------------------------
// News schemas
// ---------------------------------------------------------------------------

export const newsCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1, 'Title is required').max(200).trim(),
  content: z.string().min(10, 'Content must be at least 10 characters').trim(),
  summary: z.string().max(500).trim().optional(),
  isPublished: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Roadmap schemas
// ---------------------------------------------------------------------------

export const roadmapItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200).trim(),
  description: z.string().min(1, 'Description is required').max(2000).trim(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PLANNED'),
  priority: z.number().int().min(0).max(100).default(0),
  targetDate: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Role & Review schemas
// ---------------------------------------------------------------------------

// Roles that can be read from the database, including the operator-only
// SYSTEM_ADMIN level.
export const roleSchema = z.enum(['USER', 'DEVELOPER', 'ADMIN', 'SYSTEM_ADMIN']);

// Roles that may be assigned through the application. SYSTEM_ADMIN is
// intentionally absent: it is only reachable through the audited CLI
// bootstrap/recovery path, never through registration or an admin endpoint.
export const assignableRoleSchema = z.enum(['USER', 'DEVELOPER', 'ADMIN']);

export const publicationReviewSchema = z.object({
  targetType: z.enum(['PLUGIN', 'THEME']),
  targetId: z.string().min(1, 'Target ID is required'),
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  notes: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type Role = z.infer<typeof roleSchema>;
export type AssignableRole = z.infer<typeof assignableRoleSchema>;
export type PublicationReviewInput = z.infer<typeof publicationReviewSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type DeveloperProfileInput = z.infer<typeof developerProfileSchema>;
export type PluginCreateInput = z.infer<typeof pluginCreateSchema>;
export type PluginVersionInput = z.infer<typeof pluginVersionSchema>;
export type ThemeCreateInput = z.infer<typeof themeCreateSchema>;
export type ReleaseCreateInput = z.infer<typeof releaseCreateSchema>;
export type NewsCreateInput = z.infer<typeof newsCreateSchema>;
export type RoadmapItemInput = z.infer<typeof roadmapItemSchema>;
