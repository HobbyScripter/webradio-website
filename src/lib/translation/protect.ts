/**
 * Term protection for machine translation.
 *
 * Machine translation happily renames product names, mangles version numbers
 * and rewrites code. Everything that must survive byte-for-byte is replaced by
 * a placeholder before the text leaves the server and restored afterwards:
 *
 * - product and brand names (`WebRadio`, `GitHub`, `Icecast`, …)
 * - version numbers, SemVer and bare `1.2.3` strings
 * - inline code in backticks, CLI flags (`--verbose`), environment variables
 * - URLs, e-mail addresses and file paths with an extension
 * - `{placeholders}` used by our own message catalogues
 * - ALL-CAPS tokens of three characters or more (`API`, `MP3`, `HTTPS`)
 *
 * Two token shapes are used. `<ph id="1"/>` is DeepL's own placeholder tag and
 * requires `tag_handling=xml`; it is only used when the text contains no XML
 * metacharacters. Otherwise a plain `⟦1⟧` token is used, which survives
 * translation as a unit. `restoreTerms` accepts both.
 *
 * If a token is missing from the response, the translation is rejected
 * (`PLACEHOLDER_LOST`) instead of publishing a sentence with a hole in it.
 */

export type ProtectedTerm = {
  token: string;
  value: string;
};

export type ProtectedText = {
  masked: string;
  terms: ProtectedTerm[];
  /** `xml` when the text can safely be sent with `tag_handling=xml`. */
  mode: 'xml' | 'plain';
};

/** Brands and product names that must never be translated. */
const PROTECTED_NAMES = [
  'WebRadio',
  'WebRadio Player',
  'GitHub',
  'GitHub Actions',
  'GitHub Releases',
  'Windows',
  'macOS',
  'Linux',
  'Android',
  'iOS',
  'Icecast',
  'SHOUTcast',
  'Deepl',
  'DeepL',
  'Prisma',
  'PostgreSQL',
  'Next.js',
  'React',
  'TypeScript',
  'OAuth',
];

/**
 * Patterns applied in order. Earlier patterns win, so a URL is masked as one
 * unit before the generic "word with a dot" rule could split it.
 */
const PATTERNS: RegExp[] = [
  /https?:\/\/[^\s<>"')]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
  /`[^`\n]+`/g,
  /\b(?:v|Version\s+)?\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?\b/g,
  /(?:^|\s)(--?[a-z][a-z0-9-]{1,})(?=\s|$)/g,
  /\b[A-Z][A-Z0-9_]{2,}\b/g,
  /\b[\w-]+\.(?:exe|msi|dmg|pkg|deb|rpm|zip|tar\.gz|json|md|txt|env|yml|yaml|toml|log|ini|xml|csv)\b/gi,
];

const NAME_PATTERN = new RegExp(
  `\\b(?:${PROTECTED_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g',
);

function canUseXml(text: string): boolean {
  // DeepL's XML mode rejects unescaped markup; plain text only.
  return !/[<>&]/.test(text);
}

function tokenFor(index: number, mode: 'xml' | 'plain'): string {
  return mode === 'xml' ? `<ph id="${index}"/>` : `⟦${index}⟧`;
}

/**
 * Replace every protected term with a placeholder.
 *
 * Overlapping matches are skipped: the earliest match on the left wins, which
 * keeps the result stable and makes the round trip lossless.
 */
export function protectTerms(text: string): ProtectedText {
  const mode: 'xml' | 'plain' = canUseXml(text) ? 'xml' : 'plain';
  const terms: ProtectedTerm[] = [];

  // Collect matches from all patterns, then apply them left to right without
  // ever rewriting an already masked region.
  type Match = { start: number; end: number; value: string };
  const matches: Match[] = [];

  const collect = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      const start = match.index ?? 0;
      if (value.trim().length === 0) continue;
      matches.push({ start, end: start + value.length, value });
    }
  };

  collect(NAME_PATTERN);
  for (const pattern of PATTERNS) collect(pattern);

  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const chosen: Match[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    chosen.push(match);
    cursor = match.end;
  }

  let masked = '';
  let lastIndex = 0;
  for (const match of chosen) {
    masked += text.slice(lastIndex, match.start);
    const index = terms.length + 1;
    const token = tokenFor(index, mode);
    terms.push({ token, value: match.value });
    masked += token;
    lastIndex = match.end;
  }
  masked += text.slice(lastIndex);

  return { masked, terms, mode };
}

/**
 * Put the original terms back.
 *
 * Returns `null` when a token is missing or was duplicated by the provider —
 * the caller then treats the translation as invalid rather than accepting a
 * damaged sentence.
 */
export function restoreTerms(translated: string, terms: readonly ProtectedTerm[]): string | null {
  // Every protected term must still be present: a provider that dropped a token
  // returned an incomplete sentence, which must not be published.
  for (const term of terms) {
    const plainToken = term.token.startsWith('<ph') ? `⟦${term.token.replace(/\D/g, '')}⟧` : term.token;
    if (!translated.includes(term.token) && !translated.includes(plainToken)) {
      return null;
    }
  }

  let result = translated;
  for (const term of terms) {
    const xmlToken = term.token.startsWith('<ph') ? term.token : null;
    const plainToken = xmlToken === null ? term.token : `⟦${term.token.replace(/\D/g, '')}⟧`;

    for (const token of [term.token, xmlToken, plainToken]) {
      if (!token) continue;
      result = result.split(token).join(term.value);
    }
  }

  // Any placeholder that survived restoration means the provider dropped or
  // duplicated it: reject instead of shipping a mangled text.
  if (/(?:<ph id="\d+"\s*\/>|⟦\d+⟧)/.test(result)) {
    return null;
  }
  return result;
}

/** Characters that are sent to the provider for this text (billing estimate). */
export function billableCharacters(masked: string): number {
  return masked.length;
}
