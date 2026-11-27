/**
 * Privacy screen for outgoing translation text.
 *
 * Translation means the text leaves our server and reaches a third party. Only
 * public marketing copy is meant to be sent, so anything that looks like a
 * credential or personal data is refused **before** the request is built. A
 * refused field is reported as `PRIVACY_BLOCKED` and stays untranslated; it is
 * never sent in a redacted form either, because a partial sentence is worse
 * than a German fallback.
 *
 * Detection is deliberately conservative: false positives only mean a field has
 * to be translated by hand, while a false negative would leak data.
 */

export type PrivacyFinding =
  | 'private_key'
  | 'bearer_token'
  | 'api_key'
  | 'password'
  | 'email'
  | 'iban'
  | 'phone'
  | 'jwt';

export type PrivacyInspection = {
  safe: boolean;
  findings: PrivacyFinding[];
};

const RULES: Array<{ finding: PrivacyFinding; pattern: RegExp }> = [
  {
    finding: 'private_key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    finding: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    finding: 'bearer_token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{10,}=*/i,
  },
  {
    finding: 'api_key',
    pattern:
      /\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,})\b/,
  },
  {
    finding: 'password',
    // `password=…`, `Passwort: …`, `secret := …` in prose or config snippets.
    pattern: /\b(?:passwort|password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+/i,
  },
  {
    finding: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  },
  {
    finding: 'iban',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/,
  },
  {
    finding: 'phone',
    // International or German national format with separators, 7+ digits.
    pattern: /(?:\+\d{1,3}[\s/.-]?)?(?:\(\d{2,5}\)[\s/.-]?)?\d{3,5}[\s/.-]\d{3,}[\s/.-]?\d{0,}/,
  },
];

/**
 * Inspect one text for data that must not leave the server.
 *
 * Phone detection is restricted to strings that look like a phone number and
 * not like a date or version; a 10-digit run without separators is ignored on
 * purpose to avoid blocking every release note.
 */
export function inspectForPrivateData(text: string): PrivacyInspection {
  const findings = new Set<PrivacyFinding>();

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      findings.add(rule.finding);
    }
  }

  if (findings.has('phone')) {
    const candidate = text.match(/(?:\+\d{1,3}[\s/.-]?)?(?:\(\d{2,5}\)[\s/.-]?)?\d{3,5}[\s/.-]\d{3,}[\s/.-]?\d{0,}/)?.[0];
    const digits = candidate?.replace(/\D/g, '') ?? '';
    if (digits.length < 7 || /^\d{4}[-./]\d{2}[-./]\d{2}$/.test(candidate ?? '')) {
      findings.delete('phone');
    }
  }

  return { safe: findings.size === 0, findings: [...findings] };
}

/** Short, non-sensitive reason for the event log. */
export function describePrivacyFindings(findings: readonly PrivacyFinding[]): string {
  return findings.length === 0 ? 'clean' : findings.join(',');
}
