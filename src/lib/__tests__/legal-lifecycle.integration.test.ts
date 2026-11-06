/**
 * @jest-environment node
 *
 * Real PostgreSQL test for the legal-document lifecycle:
 * publication archives the previous version, invalid content never goes live,
 * archived versions stay restorable and consent is bound to a version.
 *
 * Runs against the disposable `_test` database created by
 * `npm run test:integration`; nothing is mocked.
 */
import { registerUser, ensureTestDatabase } from '../auth-service';
import { db } from '../db';
import {
  createLegalDocumentDraft,
  getLatestLegalConsent,
  getPublishedLegalDocument,
  listLegalDocumentVersions,
  listOutstandingLegalConsents,
  publishLegalDocument,
  recordLegalConsent,
  restoreLegalDocumentVersion,
} from '../legal-document-service';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TYPE = 'NUTZUNGSBEDINGUNGEN' as const;
const PASSWORD = 'LegalLifecycle2026!';

let adminId = '';
let memberId = '';
let firstVersionId = '';
let secondVersionId = '';
let thirdVersionId = '';

type PreExisting = { id: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' };
let preExisting: PreExisting[] = [];

const VALID_CONTENT = [
  '## Nutzungsbedingungen',
  '',
  'Betreiber: Testwert name, Teststraße 1, 12345 Teststadt.',
  '',
  'Es gelten die folgenden Regeln für die Nutzung des Angebots.',
].join('\n');

const SECOND_CONTENT = `${VALID_CONTENT}\n\n## Änderung\n\nNeue Fassung mit ergänzten Pflichten.`;

const THIRD_CONTENT = `${SECOND_CONTENT}\n\n## Weitere Änderung\n\nDritte Fassung zur Zustimmungsprüfung.`;

beforeAll(async () => {
  ensureTestDatabase();

  const admin = await registerUser({
    acceptedTerms: true,
    acceptedPrivacy: true,
    email: `legal_admin_${RUN}@webradio.test`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    name: 'Legal Admin',
  });
  adminId = admin.id;
  // Fixture setup only: this suite needs an administrator to act as publisher.
  await db.orm.public.User.where({ id: adminId }).update({ role: 'ADMIN' });

  const member = await registerUser({
    acceptedTerms: true,
    acceptedPrivacy: true,
    email: `legal_member_${RUN}@webradio.test`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    name: 'Legal Member',
  });
  memberId = member.id;

  // Remember any pre-existing versions of this type so the suite can restore
  // the database to the state it found, instead of leaving test archives behind.
  const existing = await listLegalDocumentVersions(TYPE);
  preExisting = existing.map((version) => ({ id: version.id, status: version.status }));

  await db.orm.public.LegalConsent.where({ userId: memberId }).deleteAll();
});

afterAll(async () => {
  await db.orm.public.LegalConsent.where({ userId: memberId }).deleteAll();
  await db.orm.public.LegalDocument.where({ createdBy: adminId }).deleteAll();
  await db.orm.public.AuditLog.where({ userId: adminId }).deleteAll();
  await db.orm.public.AuditLog.where({ userId: memberId }).deleteAll();
  await db.orm.public.User.where({ id: adminId }).deleteAll();
  await db.orm.public.User.where({ id: memberId }).deleteAll();

  for (const version of preExisting) {
    await db.orm.public.LegalDocument.where({ id: version.id }).update({
      status: version.status,
    });
  }

  await db.close();
});

describe('Legal document publication', () => {
  it('publishes a draft in place and keeps it as the current version', async () => {
    const draft = await createLegalDocumentDraft({
      actorId: adminId,
      type: TYPE,
      content: VALID_CONTENT,
      title: 'Nutzungsbedingungen',
      changeDescription: 'Erste Fassung',
    });
    expect(draft.status).toBe('DRAFT');
    firstVersionId = draft.id;

    const published = await publishLegalDocument({
      actorId: adminId,
      documentId: draft.id,
    });

    expect(published.id).toBe(draft.id);
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();
    expect(published.publishedBy).toBe(adminId);

    const current = await getPublishedLegalDocument(TYPE);
    expect(current?.id).toBe(draft.id);
    expect(current?.content).toContain('Testwert name');
  });

  it('archives the previous published version instead of deleting it', async () => {
    const draft = await createLegalDocumentDraft({
      actorId: adminId,
      type: TYPE,
      content: SECOND_CONTENT,
      requiresConsent: true,
    });
    secondVersionId = draft.id;

    const published = await publishLegalDocument({
      actorId: adminId,
      documentId: draft.id,
    });
    expect(published.status).toBe('PUBLISHED');
    expect(published.requiresConsent).toBe(true);

    const archived = await db.orm.public.LegalDocument.first({ id: firstVersionId });
    expect(archived).not.toBeNull();
    expect(archived?.status).toBe('ARCHIVED');
    expect(archived?.content).toBe(VALID_CONTENT);
    expect(archived?.publishedAt).not.toBeNull();

    const versions = await listLegalDocumentVersions(TYPE);
    const ids = versions.map((version) => version.id);
    expect(ids).toContain(firstVersionId);
    expect(ids).toContain(secondVersionId);

    const current = await getPublishedLegalDocument(TYPE);
    expect(current?.id).toBe(secondVersionId);
  });

  it('refuses to publish placeholders or a foreign responsible party', async () => {
    const placeholderDraft = await createLegalDocumentDraft({
      actorId: adminId,
      type: TYPE,
      content: `${VALID_CONTENT}\n\nAnbieter: [Name des Anbieters]`,
    });

    await expect(
      publishLegalDocument({ actorId: adminId, documentId: placeholderDraft.id }),
    ).rejects.toMatchObject({ code: 'LEGAL_CONTENT_INVALID' });

    await expect(
      publishLegalDocument({
        actorId: adminId,
        type: TYPE,
        content: 'Verantwortlicher: vercel.com',
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_CONTENT_INVALID' });

    const stillDraft = await db.orm.public.LegalDocument.first({ id: placeholderDraft.id });
    expect(stillDraft?.status).toBe('DRAFT');

    // Nothing was published or archived by the refused attempts.
    const current = await getPublishedLegalDocument(TYPE);
    expect(current?.id).toBe(secondVersionId);
    const archived = await db.orm.public.LegalDocument.first({ id: firstVersionId });
    expect(archived?.status).toBe('ARCHIVED');
  });

  it('publishes a new version without a draft and archives the old one atomically', async () => {
    const published = await publishLegalDocument({
      actorId: adminId,
      type: TYPE,
      content: THIRD_CONTENT,
      requiresConsent: true,
      changeDescription: 'Dritte Fassung',
    });
    thirdVersionId = published.id;

    expect(published.status).toBe('PUBLISHED');
    expect(published.versionNumber).toBeGreaterThan(2);

    const previous = await db.orm.public.LegalDocument.first({ id: secondVersionId });
    expect(previous?.status).toBe('ARCHIVED');

    const current = await getPublishedLegalDocument(TYPE);
    expect(current?.id).toBe(thirdVersionId);

    const publishedRows = await db.orm.public.LegalDocument.where({
      type: TYPE,
      status: 'PUBLISHED',
    }).all();
    const ownRows = publishedRows.filter((row) => row.createdBy === adminId);
    expect(ownRows).toHaveLength(1);
  });

  it('restores an archived version as a new draft without changing the published one', async () => {
    const restored = await restoreLegalDocumentVersion({
      actorId: adminId,
      versionId: firstVersionId,
    });

    expect(restored.status).toBe('DRAFT');
    expect(restored.content).toBe(VALID_CONTENT);
    expect(restored.versionNumber).toBeGreaterThan(3);

    const archived = await db.orm.public.LegalDocument.first({ id: firstVersionId });
    expect(archived?.status).toBe('ARCHIVED');

    const current = await getPublishedLegalDocument(TYPE);
    expect(current?.id).toBe(thirdVersionId);
  });
});

describe('Consent on a published version', () => {
  it('counts a version that requires consent as outstanding until accepted', async () => {
    const outstandingBefore = (await listOutstandingLegalConsents(memberId)).filter(
      (document) => document.type === TYPE,
    );
    expect(outstandingBefore.map((document) => document.id)).toContain(thirdVersionId);

    await recordLegalConsent({
      userId: memberId,
      documentType: TYPE,
      documentVersionId: thirdVersionId,
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const consent = await getLatestLegalConsent(memberId, TYPE);
    expect(consent?.documentVersionId).toBe(thirdVersionId);
    expect(consent?.acceptedAt).toBeTruthy();

    const outstandingAfter = (await listOutstandingLegalConsents(memberId)).filter(
      (document) => document.type === TYPE,
    );
    expect(outstandingAfter.map((document) => document.id)).not.toContain(thirdVersionId);
  });

  it('keeps earlier consents and asks again after the next publication', async () => {
    const nextContent = `${THIRD_CONTENT}\n\n## Vierte Fassung\n\nErneute Zustimmung nötig.`;
    const next = await publishLegalDocument({
      actorId: adminId,
      type: TYPE,
      content: nextContent,
      requiresConsent: true,
    });

    const outstanding = (await listOutstandingLegalConsents(memberId)).filter(
      (document) => document.type === TYPE,
    );
    expect(outstanding.map((document) => document.id)).toEqual([next.id]);

    const consents = await db.orm.public.LegalConsent.where({
      userId: memberId,
      documentType: TYPE,
    }).all();
    expect(consents).toHaveLength(1);
    expect(consents[0]?.documentVersionId).toBe(thirdVersionId);

    // The previous published version is archived, the consent itself untouched.
    const previous = await db.orm.public.LegalDocument.first({ id: thirdVersionId });
    expect(previous?.status).toBe('ARCHIVED');

    await recordLegalConsent({
      userId: memberId,
      documentType: TYPE,
      documentVersionId: next.id,
    });

    const after = (await listOutstandingLegalConsents(memberId)).filter(
      (document) => document.type === TYPE,
    );
    expect(after).toEqual([]);

    const history = await db.orm.public.LegalConsent.where({
      userId: memberId,
      documentType: TYPE,
    }).all();
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.documentVersionId)).toEqual(
      expect.arrayContaining([thirdVersionId, next.id]),
    );
  });
});
