/**
 * Template rendering and content checks for operator-managed legal documents.
 *
 * The built-in texts in `legal.ts` are the source for a new draft. Nothing here
 * publishes anything: an administrator reviews the generated draft, sees the
 * differences to the current version and publishes explicitly.
 */
import {
  impressumSections,
  privacySections,
  termsSections,
  type LegalDetails,
  type LegalSection,
  type LegalTable,
} from './legal';

export type LegalTemplateType = 'IMPRESSUM' | 'DATENSCHUTZ' | 'NUTZUNGSBEDINGUNGEN';

export type LegalContentProblem = {
  code: 'EMPTY' | 'PLACEHOLDER' | 'FOREIGN_RESPONSIBLE';
  message: string;
};

export type LegalDiffLine = {
  kind: 'unchanged' | 'added' | 'removed';
  text: string;
};

export function legalSectionsFor(
  type: LegalTemplateType,
  details: LegalDetails,
  options: { mailDeliveryConfigured?: boolean } = {},
): LegalSection[] {
  if (type === 'IMPRESSUM') {
    return impressumSections(details.operator);
  }
  if (type === 'DATENSCHUTZ') {
    return privacySections(details.operator, options.mailDeliveryConfigured ?? false);
  }
  return termsSections(details.operator);
}

function renderTable(table: LegalTable): string {
  return table.rows
    .map((row) =>
      row
        .map((cell, index) => `${table.columns[index] ?? ''}: ${cell}`)
        .filter((entry) => entry.trim().length > 0)
        .join(' · '),
    )
    .map((line) => `- ${line}`)
    .join('\n');
}

/** Markdown the admin editor understands; tables become readable bullet rows. */
export function renderLegalTemplate(
  type: LegalTemplateType,
  details: LegalDetails,
  options: { mailDeliveryConfigured?: boolean } = {},
): string {
  const sections = legalSectionsFor(type, details, options);

  return sections
    .map((section) => {
      const parts: string[] = [`## ${section.heading}`];
      if (section.address && section.address.length > 0) {
        parts.push(section.address.join('\n'));
      }
      for (const paragraph of section.paragraphs) {
        parts.push(paragraph);
      }
      if (section.table) {
        parts.push(renderTable(section.table));
      }
      return parts.join('\n\n');
    })
    .join('\n\n');
}

// A bracketed link such as `[Meldefunktion](/report)` is Markdown, not a
// placeholder, so only brackets that are not followed by a target count.
const PLACEHOLDER_PATTERN = /\[[^\]\n]{2,}\](?!\()/g;
const RESPONSIBLE_FALLBACK_PATTERN = /Verantwortlicher[^\n]{0,60}vercel\.com/i;
const FOREIGN_PROVIDER_PATTERN = /vercel\.com/i;

/** Problems that must block a publication. */
export function findLegalContentProblems(content: string): LegalContentProblem[] {
  const problems: LegalContentProblem[] = [];

  if (!content.trim()) {
    problems.push({ code: 'EMPTY', message: 'Der Text ist leer.' });
    return problems;
  }

  const placeholders = content.match(PLACEHOLDER_PATTERN) ?? [];
  for (const placeholder of placeholders.slice(0, 5)) {
    problems.push({
      code: 'PLACEHOLDER',
      message: `Platzhalter ${placeholder} muss durch eine echte Angabe ersetzt werden.`,
    });
  }

  if (RESPONSIBLE_FALLBACK_PATTERN.test(content)) {
    problems.push({
      code: 'FOREIGN_RESPONSIBLE',
      message: 'Der Text nennt einen fremden Dienst als Verantwortlichen.',
    });
  } else if (FOREIGN_PROVIDER_PATTERN.test(content)) {
    problems.push({
      code: 'FOREIGN_RESPONSIBLE',
      message: 'Der Text nennt vercel.com, obwohl der Betreiber selbst verantwortlich ist.',
    });
  }

  return problems;
}

/**
 * Line diff with a small amount of context. Lines longer than the comparison
 * budget fall back to a positional comparison instead of allocating a huge
 * matrix.
 */
export function diffLegalContent(previous: string, next: string): LegalDiffLine[] {
  const a = previous.replace(/\r/g, '').split('\n');
  const b = next.replace(/\r/g, '').split('\n');

  const ops: LegalDiffLine[] = [];

  if (a.length * b.length > 250_000) {
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const left = a[index];
      const right = b[index];
      if (left === right) {
        ops.push({ kind: 'unchanged', text: left ?? '' });
        continue;
      }
      if (left !== undefined) ops.push({ kind: 'removed', text: left });
      if (right !== undefined) ops.push({ kind: 'added', text: right });
    }
  } else {
    const width = b.length + 1;
    const dp = new Uint32Array((a.length + 1) * width);

    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        dp[i * width + j] =
          a[i] === b[j]
            ? (dp[(i + 1) * width + j + 1] ?? 0) + 1
            : Math.max(dp[(i + 1) * width + j] ?? 0, dp[i * width + j + 1] ?? 0);
      }
    }

    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        ops.push({ kind: 'unchanged', text: a[i] ?? '' });
        i += 1;
        j += 1;
      } else if ((dp[(i + 1) * width + j] ?? 0) >= (dp[i * width + j + 1] ?? 0)) {
        ops.push({ kind: 'removed', text: a[i] ?? '' });
        i += 1;
      } else {
        ops.push({ kind: 'added', text: b[j] ?? '' });
        j += 1;
      }
    }
    while (i < a.length) {
      ops.push({ kind: 'removed', text: a[i] ?? '' });
      i += 1;
    }
    while (j < b.length) {
      ops.push({ kind: 'added', text: b[j] ?? '' });
      j += 1;
    }
  }

  const keep = new Set<number>();
  ops.forEach((line, index) => {
    if (line.kind === 'unchanged') return;
    for (
      let cursor = Math.max(0, index - 2);
      cursor <= Math.min(ops.length - 1, index + 2);
      cursor += 1
    ) {
      keep.add(cursor);
    }
  });

  return ops.filter((_, index) => keep.has(index));
}
