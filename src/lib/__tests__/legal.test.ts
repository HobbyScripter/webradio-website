import {
  BUILTIN_LEGAL_DOCUMENT_IDS,
  OPERATOR_FIELDS,
  SESSION_COOKIE_NAME,
  getLegalDetails,
  impressumSections,
  isMailDeliveryConfigured,
  privacySections,
  termsSections,
} from '@/lib/legal';

const LEGAL_VARIABLES = OPERATOR_FIELDS.map((field) => field.variable);

/** Synthetic test values. Never real operator details. */
const COMPLETE_ENV: Record<string, string> = Object.fromEntries(
  OPERATOR_FIELDS.map((field) => [field.variable, `Testwert ${field.key}`]),
);

const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const variable of LEGAL_VARIABLES) {
    saved[variable] = process.env[variable];
  }
});

beforeEach(() => {
  for (const variable of LEGAL_VARIABLES) {
    delete process.env[variable];
  }
});

afterAll(() => {
  for (const variable of LEGAL_VARIABLES) {
    const value = saved[variable];
    if (value === undefined) {
      delete process.env[variable];
    } else {
      process.env[variable] = value;
    }
  }
});

function allParagraphs(detailsCompleteEnv: Record<string, string> = COMPLETE_ENV) {
  const { operator } = getLegalDetails(detailsCompleteEnv);
  return [
    ...impressumSections(operator).flatMap((section) => section.paragraphs),
    ...privacySections(operator).flatMap((section) => section.paragraphs),
    ...termsSections(operator).flatMap((section) => section.paragraphs),
  ];
}

describe('getLegalDetails', () => {
  it('works without any LEGAL_ variable and reports the missing labels', () => {
    const details = getLegalDetails();

    expect(details.complete).toBe(false);
    expect(details.missing.length).toBeGreaterThan(0);
    expect(details.missing).toContain('Anbietername');
    expect(details.operator.name).toBe('');
  });

  it('never leaks values through the missing list', () => {
    const details = getLegalDetails({ LEGAL_OPERATOR_NAME: '   ' });

    expect(details.missing).toContain('Anbietername');
    expect(details.missing.join(' ')).not.toContain('LEGAL_OPERATOR_NAME');
  });

  it('reports details as complete once every required value is set', () => {
    const details = getLegalDetails(COMPLETE_ENV);

    expect(details.complete).toBe(true);
    expect(details.missing).toEqual([]);
    expect(details.operator.name).toBe('Testwert name');
    expect(details.operator.country).toBe('Testwert country');
  });

  it('accepts missing optional values without blocking completeness', () => {
    const env = { ...COMPLETE_ENV };
    for (const field of OPERATOR_FIELDS) {
      if (!field.required) {
        delete env[field.variable];
      }
    }

    const details = getLegalDetails(env);

    expect(details.complete).toBe(true);
    expect(details.operator.phone).toBeNull();
    expect(details.operator.vatId).toBeNull();
  });
});

describe('legal sections', () => {
  it('builds all three texts from the same operator record', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);

    expect(impressumSections(operator)[0]?.heading).toBe('Anbieter');
    expect(impressumSections(operator)[0]?.address).toEqual([
      'Testwert name',
      'Testwert street',
      'Testwert postalCode Testwert city',
      'Testwert country',
    ]);
    expect(privacySections(operator)[0]?.heading).toBe('Kurzfassung');
    expect(termsSections(operator)[0]?.heading).toBe('1. Geltungsbereich');
  });

  it('names the operator and links the Impressum in the terms', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);
    const text = termsSections(operator)
      .flatMap((section) => section.paragraphs)
      .join(' ');

    expect(text).toContain('Testwert name');
    expect(text).toContain('](/impressum)');
  });

  it('describes the report flow with the real route and no role identifiers', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);
    const text = termsSections(operator)
      .flatMap((section) => section.paragraphs)
      .join(' ');

    expect(text).toContain('](/report)');
    for (const role of ['USER', 'DEVELOPER', 'ADMIN', 'SYSTEM_ADMIN']) {
      expect(text).not.toContain(role);
    }
    expect(text).not.toContain('Legal-Bereich');
  });

  it('uses the real session cookie name, lifetime and storage notes', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);
    const text = privacySections(operator)
      .flatMap((section) => section.paragraphs)
      .join(' ');

    expect(text).toContain(SESSION_COOKIE_NAME);
    expect(text).toContain('30 Tagen');
    expect(text).not.toContain('können verwendet werden');
  });

  it('renders the data categories as a table with purpose, data, basis, retention and recipients', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);
    const table = privacySections(operator)[0]?.table;

    expect(table).toBeDefined();
    expect(table?.columns).toEqual([
      'Zweck',
      'Daten',
      'Rechtsgrundlage',
      'Speicherdauer',
      'Empfänger',
    ]);
    expect(table?.rows.length).toBeGreaterThanOrEqual(5);
    for (const row of table?.rows ?? []) {
      expect(row).toHaveLength(5);
      expect(row.every((cell) => cell.trim().length > 0)).toBe(true);
    }
  });

  it('states the paused e-mail delivery instead of promising it', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);

    const paused = privacySections(operator, false)
      .flatMap((section) => section.paragraphs)
      .join(' ');
    expect(paused).toContain('nicht eingerichtet');

    const active = privacySections(operator, true)
      .flatMap((section) => section.paragraphs)
      .join(' ');
    expect(active).toContain('Testwert mailProvider');
  });

  it('contains no bracketed placeholders in rendered text', () => {
    for (const paragraph of allParagraphs()) {
      expect(paragraph).not.toMatch(/\[[A-ZÄÖÜ_ ]+\]/);
    }
  });

  it('does not contain fabricated responsible parties like "vercel.com"', () => {
    expect(allParagraphs().join(' ').toLowerCase()).not.toContain('vercel.com');
  });

  it('contains no unresolved pre-publication notes or hedges', () => {
    const text = allParagraphs().join(' ');

    for (const hedge of [
      'gegebenenfalls',
      'vor der Veröffentlichung zu prüfen',
      'sind vor der Veröffentlichung',
      'vor einer Veröffentlichung rechtlich',
      'Nicht vorhanden',
    ]) {
      expect(text).not.toContain(hedge);
    }
  });
});

describe('legal configuration helpers', () => {
  it('treats paused e-mail delivery as not configured', () => {
    expect(
      isMailDeliveryConfigured({
        EMAIL_SERVER_HOST: 'smtp.example.test',
        EMAIL_FROM: 'noreply@example.test',
      }),
    ).toBe(false);
  });

  it('reports delivery as configured only with a provider, sender and explicit switch', () => {
    expect(
      isMailDeliveryConfigured({
        EMAIL_DELIVERY_ENABLED: 'true',
        EMAIL_SERVER_HOST: 'smtp.example.test',
        EMAIL_FROM: 'noreply@example.test',
      }),
    ).toBe(true);

    expect(
      isMailDeliveryConfigured({
        EMAIL_DELIVERY_ENABLED: 'true',
        EMAIL_FROM: 'noreply@example.test',
      }),
    ).toBe(false);
  });

  it('keeps stable identifiers for the built-in text versions', () => {
    expect(BUILTIN_LEGAL_DOCUMENT_IDS.NUTZUNGSBEDINGUNGEN).toBe(
      'builtin:nutzungsbedingungen:1',
    );
    expect(BUILTIN_LEGAL_DOCUMENT_IDS.DATENSCHUTZ).toBe('builtin:datenschutz:1');
  });
});
