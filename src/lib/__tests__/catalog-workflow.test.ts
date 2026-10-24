import {
  canModerate,
  canSubmitForReview,
  decisionOutcome,
  decisionRequiresNotes,
  editOutcome,
  isPubliclyVisible,
  isValidModerationNotes,
  versionOutcome,
} from '../catalog-workflow';

describe('public visibility', () => {
  it('requires both APPROVED and isPublished', () => {
    expect(isPubliclyVisible({ status: 'APPROVED', isPublished: true })).toBe(true);
    expect(isPubliclyVisible({ status: 'APPROVED', isPublished: false })).toBe(false);
    expect(isPubliclyVisible({ status: 'PENDING_REVIEW', isPublished: true })).toBe(false);
    expect(isPubliclyVisible({ status: 'REJECTED', isPublished: true })).toBe(false);
    expect(isPubliclyVisible({ status: 'CHANGES_REQUESTED', isPublished: true })).toBe(false);
    expect(isPubliclyVisible({ status: 'DRAFT', isPublished: false })).toBe(false);
  });
});

describe('edit outcome', () => {
  it('withdraws and re-reviews approved or published entries', () => {
    expect(editOutcome({ status: 'APPROVED', isPublished: false })).toEqual({
      status: 'PENDING_REVIEW',
      isPublished: false,
      requiresReReview: true,
    });
    expect(editOutcome({ status: 'ARCHIVED', isPublished: true })).toEqual({
      status: 'PENDING_REVIEW',
      isPublished: false,
      requiresReReview: true,
    });
  });

  it('keeps drafts and rejected entries out of the catalogue', () => {
    expect(editOutcome({ status: 'DRAFT', isPublished: false })).toEqual({
      status: 'DRAFT',
      isPublished: false,
      requiresReReview: false,
    });
    expect(editOutcome({ status: 'CHANGES_REQUESTED', isPublished: false })).toEqual({
      status: 'CHANGES_REQUESTED',
      isPublished: false,
      requiresReReview: false,
    });
  });
});

describe('submission', () => {
  it('allows drafts, rejected, change-requested and withdrawn entries', () => {
    expect(canSubmitForReview('DRAFT')).toBe(true);
    expect(canSubmitForReview('REJECTED')).toBe(true);
    expect(canSubmitForReview('CHANGES_REQUESTED')).toBe(true);
    expect(canSubmitForReview('ARCHIVED')).toBe(true);
  });

  it('rejects already pending or approved entries', () => {
    expect(canSubmitForReview('PENDING_REVIEW')).toBe(false);
    expect(canSubmitForReview('APPROVED')).toBe(false);
  });
});

describe('versions during review', () => {
  it('blocks new versions while a submission is pending', () => {
    expect(versionOutcome({ status: 'PENDING_REVIEW', isPublished: false })).toMatchObject({
      blocked: true,
      status: 'PENDING_REVIEW',
    });
  });

  it('requires a new review when an approved entry changes', () => {
    expect(versionOutcome({ status: 'APPROVED', isPublished: true })).toEqual({
      blocked: false,
      status: 'PENDING_REVIEW',
      isPublished: false,
      requiresReReview: true,
    });
  });

  it('keeps drafts unpublished without review', () => {
    expect(versionOutcome({ status: 'DRAFT', isPublished: false })).toMatchObject({
      blocked: false,
      requiresReReview: false,
      isPublished: false,
    });
  });
});

describe('moderation decisions', () => {
  it('only pending submissions can be decided', () => {
    expect(canModerate('PENDING_REVIEW')).toBe(true);
    expect(canModerate('APPROVED')).toBe(false);
    expect(canModerate('DRAFT')).toBe(false);
    expect(canModerate('REJECTED')).toBe(false);
  });

  it('maps decisions to persisted states', () => {
    expect(decisionOutcome('APPROVED')).toEqual({ status: 'APPROVED', isPublished: true });
    expect(decisionOutcome('REJECTED')).toEqual({ status: 'REJECTED', isPublished: false });
    expect(decisionOutcome('CHANGES_REQUESTED')).toEqual({
      status: 'CHANGES_REQUESTED',
      isPublished: false,
    });
  });

  it('requires a meaningful reason for rejection and change requests', () => {
    expect(decisionRequiresNotes('APPROVED')).toBe(false);
    expect(decisionRequiresNotes('REJECTED')).toBe(true);
    expect(isValidModerationNotes('APPROVED', undefined)).toBe(true);
    expect(isValidModerationNotes('REJECTED', 'zu kurz')).toBe(false);
    expect(isValidModerationNotes('REJECTED', 'Bitte Beschreibung ergänzen.')).toBe(true);
    expect(isValidModerationNotes('CHANGES_REQUESTED', '           ')).toBe(false);
  });
});
