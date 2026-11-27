/**
 * @jest-environment node
 *
 * B1 — what the public site may and may not receive.
 *
 * These are the delivery rules, exercised in memory so every guard is visible:
 * an approved, current row replaces the German text; a missing, outdated,
 * rejected or machine-only row falls back; a field that is not public copy can
 * never be introduced by a translation row. `localizeRecords` is the single
 * query the public data layer uses, which is asserted by counting reads.
 */
import { fakeDb } from '../testing/fake-db';

jest.mock('@/lib/db', () => ({ db: require('../testing/fake-db').fakeDb }));

import { TRANSLATABLE_FIELDS, localizeRecord, localizeRecords } from '@/lib/content-translations';
import { hashSourceText } from '../jobs';

const SOURCE = 'Live aus dem Studio.';

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'news-1', title: SOURCE, summary: 'Kurz', content: 'Text', ...overrides };
}

function seed(overrides: Record<string, unknown> = {}): void {
  fakeDb.seed('ContentTranslation', [
    {
      entityType: 'News',
      entityId: 'news-1',
      locale: 'en',
      field: 'title',
      value: 'Live from the studio.',
      status: 'APPROVED',
      outdated: false,
      sourceHash: hashSourceText(SOURCE),
      ...overrides,
    },
  ]);
}

beforeEach(() => fakeDb.reset());

describe('approved translations are delivered', () => {
  it('replaces the German title for en', async () => {
    seed();

    const [localized] = await localizeRecords('News', 'en', [record()]);

    expect(localized.title).toBe('Live from the studio.');
    // Untranslated fields keep their source value.
    expect(localized.summary).toBe('Kurz');
  });

  it('replaces the German title for pl from its own row', async () => {
    seed({ locale: 'pl', value: 'Na żywo ze studia.' });

    const [localized] = await localizeRecords('News', 'pl', [record()]);

    expect(localized.title).toBe('Na żywo ze studia.');
  });

  it('localizes a single record through localizeRecord', async () => {
    seed();

    const localized = await localizeRecord('News', 'news-1', 'en', {
      title: SOURCE,
      summary: 'Kurz',
      content: 'Text',
    });

    expect(localized.title).toBe('Live from the studio.');
  });
});

describe('fallback to German', () => {
  it('keeps German when no translation exists', async () => {
    const [localized] = await localizeRecords('News', 'en', [record()]);
    expect(localized.title).toBe(SOURCE);
  });

  it('keeps German when the row is outdated', async () => {
    seed({ outdated: true });

    const [localized] = await localizeRecords('News', 'en', [record()]);
    expect(localized.title).toBe(SOURCE);
  });

  it.each(['MACHINE_TRANSLATED', 'REVIEW_REQUIRED', 'REJECTED'] as const)(
    'keeps German when the row is %s',
    async (status) => {
      seed({ status });

      const [localized] = await localizeRecords('News', 'en', [record()]);
      expect(localized.title).toBe(SOURCE);
    },
  );

  it('keeps German when the German text changed after the translation', async () => {
    // The flag was never set — the hash alone must catch it.
    seed();

    const [localized] = await localizeRecords('News', 'en', [
      record({ title: 'Neuer Text aus dem Studio.' }),
    ]);

    expect(localized.title).toBe('Neuer Text aus dem Studio.');
  });

  it('keeps German for approved rows of the default locale without querying', async () => {
    seed();
    const where = jest.spyOn(fakeDb.table('ContentTranslation'), 'where');

    const [localized] = await localizeRecords('News', 'de', [record()]);

    expect(localized.title).toBe(SOURCE);
    expect(where).not.toHaveBeenCalled();
  });

  it('mixes translated and untranslated records in one list', async () => {
    seed();
    fakeDb.seed('News', [{ id: 'news-2', title: 'Zweite Meldung' }]);

    const localized = await localizeRecords('News', 'en', [
      record(),
      { id: 'news-2', title: 'Zweite Meldung', summary: '', content: '' },
    ]);

    expect(localized.map((entry) => entry.title)).toEqual([
      'Live from the studio.',
      'Zweite Meldung',
    ]);
  });
});

describe('visibility and privacy guards', () => {
  it('never introduces a field that is not part of the public record', async () => {
    seed({ field: 'internalNotes', value: 'INTERN: nur für das Team' });

    const [localized] = await localizeRecords('News', 'en', [record()]);

    expect(localized).not.toHaveProperty('internalNotes');
    expect(JSON.stringify(localized)).not.toContain('INTERN');
  });

  it('never replaces a field that is not on the translation allowlist', async () => {
    seed({ field: 'contactEmail', value: 'leak@example.com' });

    const [localized] = await localizeRecords('News', 'en', [
      record({ contactEmail: 'team@example.com' }),
    ]);

    expect(localized.contactEmail).toBe('team@example.com');
    expect(JSON.stringify(localized)).not.toContain('leak@example.com');
  });

  it('ignores rows of another entity type', async () => {
    seed({ entityType: 'Partner', value: 'Falsche Entität' });

    const [localized] = await localizeRecords('News', 'en', [record()]);
    expect(localized.title).toBe(SOURCE);
  });

  it('ignores empty translation values', async () => {
    seed({ value: '   ' });

    const [localized] = await localizeRecords('News', 'en', [record()]);
    expect(localized.title).toBe(SOURCE);
  });
});

describe('all supported content types', () => {
  const entityTypes = Object.entries(TRANSLATABLE_FIELDS);

  it.each(entityTypes)('localizes every translatable field of %s', async (entityType, fields) => {
    fakeDb.seed(
      'ContentTranslation',
      fields.map((field) => ({
        entityType,
        entityId: 'entity-1',
        locale: 'en',
        field,
        value: `EN ${field}`,
        status: 'APPROVED',
        outdated: false,
        sourceHash: hashSourceText(`Quelle ${field}`),
      })),
    );
    const source = Object.fromEntries(fields.map((field) => [field, `Quelle ${field}`]));

    const [localized] = await localizeRecords(entityType, 'en', [
      { id: 'entity-1', ...source } as Record<string, unknown>,
    ]);

    for (const field of fields) {
      expect(localized[field]).toBe(`EN ${field}`);
    }
  });

  it('leaves identifiers and non-copy columns untouched for every entity type', async () => {
    for (const [entityType] of entityTypes) {
      fakeDb.reset();
      seed({ entityType, field: 'slug', value: 'LOCALIZED-SLUG' });

      const [localized] = await localizeRecords(entityType, 'en', [
        record({ slug: 'original-slug' }),
      ]);

      expect(localized.slug).toBe('original-slug');
    }
  });
});

describe('query cost', () => {
  it('loads every row for a list with a single query', async () => {
    fakeDb.seed('ContentTranslation', [
      {
        entityType: 'News',
        entityId: 'news-1',
        locale: 'en',
        field: 'title',
        value: 'One',
        status: 'APPROVED',
        outdated: false,
        sourceHash: hashSourceText(SOURCE),
      },
      {
        entityType: 'News',
        entityId: 'news-2',
        locale: 'en',
        field: 'title',
        value: 'Two',
        status: 'APPROVED',
        outdated: false,
        sourceHash: hashSourceText('Zweite Meldung'),
      },
    ]);
    const where = jest.spyOn(fakeDb.table('ContentTranslation'), 'where');

    await localizeRecords('News', 'en', [
      record(),
      { id: 'news-2', title: 'Zweite Meldung', summary: '', content: '' },
      { id: 'news-3', title: 'Dritte Meldung', summary: '', content: '' },
    ]);

    expect(where).toHaveBeenCalledTimes(1);
  });

  it('does not query at all for an empty list', async () => {
    const where = jest.spyOn(fakeDb.table('ContentTranslation'), 'where');

    expect(await localizeRecords('News', 'en', [])).toEqual([]);
    expect(where).not.toHaveBeenCalled();
  });
});
