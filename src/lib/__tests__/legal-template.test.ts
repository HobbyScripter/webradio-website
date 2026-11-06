import { getLegalDetails } from '../legal';
import {
  diffLegalContent,
  findLegalContentProblems,
  renderLegalTemplate,
} from '../legal-template';

const COMPLETE_ENV = {
  LEGAL_OPERATOR_NAME: 'Testwert name',
  LEGAL_OPERATOR_STREET: 'Teststraße 1',
  LEGAL_OPERATOR_POSTAL_CODE: '12345',
  LEGAL_OPERATOR_CITY: 'Teststadt',
  LEGAL_OPERATOR_COUNTRY: 'Deutschland',
  LEGAL_OPERATOR_EMAIL: 'kontakt@example.test',
  LEGAL_OPERATOR_CONTENT_RESPONSIBLE: 'Testwert name',
  LEGAL_HOSTING_PROVIDER: 'Hosting Test',
  LEGAL_HOSTING_REGION: 'Frankfurt',
  LEGAL_DATABASE_PROVIDER: 'Datenbank Test',
  LEGAL_DATABASE_REGION: 'Frankfurt',
  LEGAL_MAIL_PROVIDER: 'Mail Test',
  LEGAL_RETENTION_SESSIONS: '30 Tage',
  LEGAL_RETENTION_AUDIT_LOGS: '90 Tage',
  LEGAL_RETENTION_RATE_LIMITS: '24 Stunden',
  LEGAL_SUPERVISORY_AUTHORITY: 'Aufsicht Test',
};

describe('legal template', () => {
  it('renders all three document types without placeholders', () => {
    const details = getLegalDetails(COMPLETE_ENV);

    for (const type of ['IMPRESSUM', 'DATENSCHUTZ', 'NUTZUNGSBEDINGUNGEN'] as const) {
      const content = renderLegalTemplate(type, details);

      expect(content.length).toBeGreaterThan(200);
      expect(content).toContain('Testwert name');
      expect(findLegalContentProblems(content)).toEqual([]);
      expect(content).not.toMatch(/Verantwortlicher[^\n]*vercel\.com/i);
    }
  });

  it('refuses a template while operator details are missing', () => {
    const details = getLegalDetails({});
    expect(details.complete).toBe(false);
  });
});

describe('findLegalContentProblems', () => {
  it('flags a bracketed placeholder', () => {
    const problems = findLegalContentProblems('Anbieter: [Name des Anbieters]');

    expect(problems.map((problem) => problem.code)).toContain('PLACEHOLDER');
  });

  it('does not treat a Markdown link as a placeholder', () => {
    expect(findLegalContentProblems('Nutze die [Meldefunktion](/report).')).toEqual([]);
  });

  it('flags vercel.com as the responsible party', () => {
    const problems = findLegalContentProblems('Verantwortlicher: vercel.com');

    expect(problems.map((problem) => problem.code)).toContain('FOREIGN_RESPONSIBLE');
  });

  it('flags empty content', () => {
    expect(findLegalContentProblems('   ').map((problem) => problem.code)).toEqual(['EMPTY']);
  });
});

describe('diffLegalContent', () => {
  it('reports removed and added lines with context', () => {
    const diff = diffLegalContent('A\nB\nC\nD', 'A\nB\nX\nD');

    expect(diff.some((line) => line.kind === 'removed' && line.text === 'C')).toBe(true);
    expect(diff.some((line) => line.kind === 'added' && line.text === 'X')).toBe(true);
    expect(diff.some((line) => line.kind === 'unchanged' && line.text === 'A')).toBe(true);
  });

  it('returns no lines for identical content', () => {
    expect(diffLegalContent('A\nB', 'A\nB')).toEqual([]);
  });
});
