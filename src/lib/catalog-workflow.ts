/**
 * Catalogue moderation rules.
 *
 * Pure functions shared by the developer service, the admin moderation service
 * and their tests. Keeping the transitions here means a status change is
 * validated identically no matter which surface triggered it.
 */
import type { CatalogStatus } from './validations';

export type CatalogKind = 'PLUGIN' | 'THEME';

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  PLUGIN: 'Plugin',
  THEME: 'Theme',
};

export type ModerationDecision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

/** Public catalogue visibility: approved AND published (and WebRadio-bound). */
export function isPubliclyVisible(entry: { status: CatalogStatus; isPublished: boolean }): boolean {
  return entry.status === 'APPROVED' && entry.isPublished;
}

/**
 * Result of editing an existing entry.
 *
 * An approved (or published) entry must not stay approved after its content
 * changed: that would let a developer bypass review. The edit moves it back to
 * the moderation queue and withdraws it from the public catalogue.
 */
export function editOutcome(current: {
  status: CatalogStatus;
  isPublished: boolean;
}): { status: CatalogStatus; isPublished: boolean; requiresReReview: boolean } {
  if (current.status === 'APPROVED' || current.isPublished) {
    return { status: 'PENDING_REVIEW', isPublished: false, requiresReReview: true };
  }

  return { status: current.status, isPublished: false, requiresReReview: false };
}

/**
 * An administrative takedown is terminal. `REMOVED` is deliberately absent from
 * `canSubmitForReview()`, so the owner can never re-enter the review queue with
 * removed content — that would let a takedown be undone by the reported party.
 */
export function isRemovedEntry(status: CatalogStatus): boolean {
  return status === 'REMOVED';
}

/** A draft, rejected, change-requested or withdrawn entry may be submitted. */
export function canSubmitForReview(status: CatalogStatus): boolean {
  return (
    status === 'DRAFT' ||
    status === 'REJECTED' ||
    status === 'CHANGES_REQUESTED' ||
    status === 'ARCHIVED'
  );
}

/**
 * Result of adding a version.
 *
 * Adding a release to an approved/published entry is a content change and
 * therefore requires a new review. A pending submission is frozen while a
 * moderator is looking at it.
 */
export function versionOutcome(
  current: {
    status: CatalogStatus;
    isPublished: boolean;
  },
  options?: {
    requiresManualReview?: boolean;
  },
): { blocked: boolean; status: CatalogStatus; isPublished: boolean; requiresReReview: boolean } {
  if (current.status === 'PENDING_REVIEW') {
    return {
      blocked: true,
      status: current.status,
      isPublished: false,
      requiresReReview: false,
    };
  }

  if (current.status === 'APPROVED' || current.isPublished) {
    // A normal update of an already approved entry may be published
    // automatically once the automated checks pass. Suspicious changes still
    // require a full manual review.
    if (options?.requiresManualReview) {
      return {
        blocked: false,
        status: 'PENDING_REVIEW',
        isPublished: false,
        requiresReReview: true,
      };
    }

    return {
      blocked: false,
      status: 'APPROVED',
      isPublished: true,
      requiresReReview: false,
    };
  }

  return {
    blocked: false,
    status: current.status,
    isPublished: false,
    requiresReReview: false,
  };
}

/** Only a submission that is actually waiting for a decision can be decided. */
export function canModerate(status: CatalogStatus): boolean {
  return status === 'PENDING_REVIEW';
}

/**
 * Map a reviewer decision to the persisted catalogue state.
 * Approval publishes the entry; every other decision withdraws it.
 */
export function decisionOutcome(decision: ModerationDecision): {
  status: CatalogStatus;
  isPublished: boolean;
} {
  switch (decision) {
    case 'APPROVED':
      return { status: 'APPROVED', isPublished: true };
    case 'REJECTED':
      return { status: 'REJECTED', isPublished: false };
    case 'CHANGES_REQUESTED':
      return { status: 'CHANGES_REQUESTED', isPublished: false };
  }
}

/** A rejection or change request requires a human-readable reason. */
export function decisionRequiresNotes(decision: ModerationDecision): boolean {
  return decision !== 'APPROVED';
}

export const MODERATION_NOTES_MIN_LENGTH = 10;

export function isValidModerationNotes(
  decision: ModerationDecision,
  notes: string | undefined,
): boolean {
  if (!decisionRequiresNotes(decision)) {
    return true;
  }
  return (notes?.trim().length ?? 0) >= MODERATION_NOTES_MIN_LENGTH;
}
