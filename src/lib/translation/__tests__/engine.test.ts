/**
 * @jest-environment node
 *
 * Engine rules, exercised against an in-memory database and the mock provider:
 *
 * - machine output is never approved on its own,
 * - an approval is never overwritten,
 * - a second batch makes no second paid call,
 * - legal content always needs review,
 * - personal data is never sent,
 * - a changed source marks translations outdated and hides them from readers,
 * - every decision lands in the history.
 */
import { fakeDb } from '../testing/fake-db';

jest.mock('@/lib/db', () => ({ db: require('../testing/fake-db').fakeDb }));

import {
  collectTranslationTargets,
  markOutdatedTranslations,
  retranslateField,
  runTranslationBatch,
} from '../engine';
import { hashSourceText, jobKeyFor } from '../jobs';
import { MockProvider } from '../providers/mock';
import { getApprovedTranslations, localizeRecord } from '@/lib/content-translations';

const ENV = { NODE_ENV: 'test' } as Record<string, string | undefined>;

function seedPlugin(overrides: Record<string, unknown> = {}): void {
  fakeDb.seed('Plugin', [
    {
      id: 'plugin-1',
      slug: 'alpha-plugin',
      name: 'Alpha Plugin',
      description: 'Ein Plugin für WebRadio mit Playlist-Unterstützung.',
      isPublished: true,
      ...overrides,
    },
  ]);
}

function rows(table: string) {
  return fakeDb.rows(table);
}

beforeEach(() => fakeDb.reset());

describe('missing translations', () => {
  it('translates missing fields as MACHINE_TRANSLATED and records usage', async () => {
    seedPlugin();
    const provider = new MockProvider();

    const summary = await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    expect(summary.ok).toBe(true);
    expect(summary.translated).toBe(2);
    expect(summary.characters).toBeGreaterThan(0);
    expect(summary.costMicros).toBeGreaterThan(0);

    const translations = rows('ContentTranslation');
    expect(translations).toHaveLength(2);
    for (const row of translations) {
      expect(row.status).toBe('MACHINE_TRANSLATED');
      expect(row.provider).toBe('mock');
      expect(String(row.value)).toContain('⟪en⟫');
      expect(row.sourceHash).toBe(hashSourceText(String(row.field === 'name' ? 'Alpha Plugin' : 'Ein Plugin für WebRadio mit Playlist-Unterstützung.')));
    }

    expect(rows('TranslationUsage')).toHaveLength(2);
    expect(rows('TranslationEvent').filter((event) => event.action === 'MACHINE_TRANSLATED')).toHaveLength(2);
    expect(rows('TranslationJob').every((job) => job.status === 'SUCCEEDED')).toBe(true);
  });

  it('covers every requested locale but never German', async () => {
    seedPlugin({ name: 'Alpha', description: 'Kurz.' });
    await runTranslationBatch({
      locales: ['de', 'nl', 'fr'],
      provider: new MockProvider(),
      env: ENV,
    });

    const locales = new Set(rows('ContentTranslation').map((row) => row.locale));
    expect([...locales].sort()).toEqual(['fr', 'nl']);
  });

  it('does not call the provider twice for the same source text', async () => {
    seedPlugin();
    const provider = new MockProvider();

    const first = await runTranslationBatch({ locales: ['en'], provider, env: ENV });
    const second = await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    expect(first.translated).toBe(2);
    expect(provider.calls).toBe(2);
    expect(second.translated).toBe(0);
    expect(second.attempted).toBe(0);
    expect(rows('TranslationUsage')).toHaveLength(2);
  });

  it('skips everything when no provider is configured', async () => {
    seedPlugin();
    const summary = await runTranslationBatch({ locales: ['en'], env: {} });
    expect(summary.ok).toBe(false);
    expect(summary.code).toBe('NOT_CONFIGURED');
    expect(rows('ContentTranslation')).toHaveLength(0);
  });
});

describe('approval protection', () => {
  it('never overwrites an approved translation', async () => {
    seedPlugin();
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'en',
        field: 'description',
        value: 'Approved by a human.',
        status: 'APPROVED',
        provider: null,
        sourceHash: hashSourceText('Ein Plugin für WebRadio mit Playlist-Unterstützung.'),
        outdated: false,
      },
    ]);

    const provider = new MockProvider();
    const summary = await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    const approved = rows('ContentTranslation').find((row) => row.id === 'translation-1');
    expect(approved?.value).toBe('Approved by a human.');
    expect(approved?.status).toBe('APPROVED');
    expect(provider.calls).toBe(1); // only the name
    expect(summary.attempted).toBe(1);
  });

  it('refuses to retranslate an approved field', async () => {
    seedPlugin();
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'en',
        field: 'name',
        value: 'Approved name',
        status: 'APPROVED',
        provider: null,
        sourceHash: hashSourceText('Alpha Plugin'),
        outdated: false,
      },
    ]);

    const provider = new MockProvider();
    const result = await retranslateField({
      entityType: 'Plugin',
      entityId: 'plugin-1',
      field: 'name',
      locale: 'en',
      provider,
      env: ENV,
    });

    expect(result).toEqual({ ok: false, code: 'APPROVED_PROTECTED' });
    expect(provider.calls).toBe(0);
  });
});

describe('status policy', () => {
  it('marks legal content as REVIEW_REQUIRED instead of APPROVED', async () => {
    fakeDb.seed('LegalDocument', [
      {
        id: 'legal-1',
        type: 'PRIVACY',
        versionNumber: 1,
        title: 'Datenschutz',
        content: 'Diese Erklärung beschreibt die Verarbeitung personenbezogener Daten.',
        status: 'PUBLISHED',
      },
    ]);

    await runTranslationBatch({
      locales: ['en'],
      entityTypes: ['LegalDocument'],
      provider: new MockProvider(),
      env: ENV,
    });

    const translations = rows('ContentTranslation');
    expect(translations.length).toBeGreaterThan(0);
    expect(translations.every((row) => row.status === 'REVIEW_REQUIRED')).toBe(true);
    expect(translations.every((row) => row.reviewedAt === null)).toBe(true);
  });
});

describe('privacy', () => {
  it('does not send a field containing an e-mail address', async () => {
    seedPlugin({ name: 'Kontakt', description: 'Fragen an support@example.com jederzeit.' });
    const provider = new MockProvider();

    const summary = await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    expect(provider.calls).toBe(1);
    expect(summary.blocked).toBe(1);
    const blocked = rows('ContentTranslation').find((row) => row.field === 'description');
    expect(blocked).toBeUndefined();

    const job = rows('TranslationJob').find((entry) => entry.field === 'description');
    expect(job?.status).toBe('SKIPPED');
    expect(job?.errorCode).toBe('PRIVACY_BLOCKED');
    expect(rows('TranslationEvent').some((event) => event.action === 'BLOCKED')).toBe(true);
  });

  it('does not send a field containing a credential', async () => {
    seedPlugin({ name: 'Zugang', description: 'password = supergeheim123' });
    const provider = new MockProvider();
    await runTranslationBatch({ locales: ['en'], provider, env: ENV });
    expect(provider.calls).toBe(1);
  });
});

describe('provider failures', () => {
  it('records the error code and stores no translation', async () => {
    seedPlugin();
    const provider = new MockProvider({ failWith: 'RATE_LIMITED' });

    const summary = await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    expect(summary.failed).toBe(2);
    expect(summary.translated).toBe(0);
    expect(rows('ContentTranslation')).toHaveLength(0);
    expect(rows('TranslationUsage')).toHaveLength(0);
    expect(rows('TranslationJob').every((job) => job.status === 'FAILED')).toBe(true);
    expect(rows('TranslationJob').every((job) => job.errorCode === 'RATE_LIMITED')).toBe(true);
    expect(rows('TranslationEvent').filter((event) => event.action === 'FAILED')).toHaveLength(2);
  });
});

describe('outdated sources', () => {
  it('flags a translation whose source changed and stops serving it', async () => {
    seedPlugin({ description: 'Neue Beschreibung nach der Übersetzung.' });
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'en',
        field: 'description',
        value: 'Old approved text',
        status: 'APPROVED',
        provider: 'deepl',
        sourceHash: hashSourceText('Alte Beschreibung.'),
        outdated: false,
      },
    ]);

    const result = await markOutdatedTranslations();

    expect(result.marked).toBe(1);
    const row = rows('ContentTranslation')[0];
    expect(row.outdated).toBe(true);
    expect(row.status).toBe('APPROVED'); // the decision is kept, only marked
    expect(rows('TranslationEvent').some((event) => event.action === 'MARKED_OUTDATED')).toBe(true);

    await expect(getApprovedTranslations('Plugin', 'plugin-1', 'en')).resolves.toEqual({});
  });

  it('treats a mismatched source hash as outdated even without the flag', async () => {
    seedPlugin({ description: 'Neue Beschreibung.' });
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'en',
        field: 'description',
        value: 'Text from the old source',
        status: 'MACHINE_TRANSLATED',
        provider: 'mock',
        sourceHash: hashSourceText('Alte Beschreibung.'),
        outdated: false,
      },
    ]);

    const { targets } = await collectTranslationTargets({ locales: ['en'] });
    const target = targets.find((entry) => entry.field === 'description');
    expect(target?.outdated).toBe(true);

    const provider = new MockProvider();
    await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    const updated = rows('ContentTranslation').find((row) => row.id === 'translation-1');
    expect(updated?.sourceHash).toBe(hashSourceText('Neue Beschreibung.'));
    expect(updated?.value).toContain('⟪en⟫');
  });

  it('re-translates an outdated row in the next batch', async () => {
    seedPlugin({ description: 'Neue Beschreibung.' });
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'en',
        field: 'description',
        value: 'Old text',
        status: 'MACHINE_TRANSLATED',
        provider: 'mock',
        sourceHash: hashSourceText('Alte Beschreibung.'),
        outdated: true,
      },
    ]);

    const provider = new MockProvider();
    const summary = await runTranslationBatch({ locales: ['en'], provider, env: ENV });

    expect(summary.translated).toBeGreaterThanOrEqual(1);
    const updated = rows('ContentTranslation').find((row) => row.id === 'translation-1');
    expect(updated?.outdated).toBe(false);
    expect(updated?.sourceHash).toBe(hashSourceText('Neue Beschreibung.'));
  });
});

describe('public fallback', () => {
  it('applies an approved translation whose hash still matches', async () => {
    const source = { description: 'Original deutscher Text.' };
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'nl',
        field: 'description',
        value: 'Goedgekeurde tekst.',
        status: 'APPROVED',
        provider: 'deepl',
        sourceHash: hashSourceText(source.description),
        outdated: false,
      },
    ]);

    const localized = await localizeRecord('Plugin', 'plugin-1', 'nl', source);
    expect(localized.description).toBe('Goedgekeurde tekst.');
  });

  it('falls back to the German source when the hash no longer matches', async () => {
    const source = { description: 'Geänderter deutscher Text.' };
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'nl',
        field: 'description',
        value: 'Verouderde tekst.',
        status: 'APPROVED',
        provider: 'deepl',
        sourceHash: hashSourceText('Alter deutscher Text.'),
        outdated: false,
      },
    ]);

    const localized = await localizeRecord('Plugin', 'plugin-1', 'nl', source);
    expect(localized.description).toBe('Geänderter deutscher Text.');
  });

  it('ignores machine translations that were never approved', async () => {
    const source = { description: 'Deutscher Text.' };
    fakeDb.seed('ContentTranslation', [
      {
        id: 'translation-1',
        entityType: 'Plugin',
        entityId: 'plugin-1',
        locale: 'fr',
        field: 'description',
        value: 'Texte machine.',
        status: 'MACHINE_TRANSLATED',
        provider: 'deepl',
        sourceHash: hashSourceText(source.description),
        outdated: false,
      },
    ]);

    const localized = await localizeRecord('Plugin', 'plugin-1', 'fr', source);
    expect(localized.description).toBe('Deutscher Text.');
  });
});

describe('target collection', () => {
  it('builds a matrix of source fields and target locales', async () => {
    seedPlugin();
    const { targets } = await collectTranslationTargets({ locales: ['en', 'pl'] });
    expect(targets).toHaveLength(4);
    expect(targets.every((target) => target.status === 'MISSING')).toBe(true);
  });

  it('ignores unpublished sources entirely', async () => {
    seedPlugin({ isPublished: false });
    const { targets } = await collectTranslationTargets({ locales: ['en'] });
    expect(targets).toHaveLength(0);
  });
});

describe('idempotency keys', () => {
  it('is stable per source text and changes with the source', () => {
    const base = {
      entityType: 'Plugin',
      entityId: 'plugin-1',
      locale: 'en' as const,
      field: 'name',
      sourceHash: hashSourceText('Alpha'),
    };
    expect(jobKeyFor(base)).toBe(jobKeyFor({ ...base }));
    expect(jobKeyFor(base)).not.toBe(jobKeyFor({ ...base, sourceHash: hashSourceText('Beta') }));
  });
});
