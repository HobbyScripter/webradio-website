import {
  OPERATOR_FIELDS,
  getLegalDetails,
  impressumSections,
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
  it('builds the Impressum, Datenschutz and Nutzungsregeln sections from the details', () => {
    const { operator } = getLegalDetails(COMPLETE_ENV);

    expect(impressumSections(operator)[0]?.heading).toBe('Angaben gemäß § 5 DDG');
    expect(privacySections(operator)[0]?.heading).toBe('1. Verantwortlicher');
    expect(termsSections(operator)[0]?.heading).toBe('1. Geltungsbereich');
  });
});
