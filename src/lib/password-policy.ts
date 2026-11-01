/**
 * Password rules for every account-creating or password-changing path.
 *
 * The rules are deliberately length-based instead of requiring character
 * classes: a long passphrase is stronger than "Pa$$w0rt1" and easier for a
 * password manager to generate. A local list rejects the handful of passwords
 * that show up in every credential-stuffing list; nothing is sent anywhere, so
 * checking a new password does not leak it to a third party.
 *
 * 72 characters is the hard limit of bcrypt: everything beyond the 72nd byte
 * is silently ignored by the hash function. Rejecting a longer value is
 * honest, because the stored hash would not cover the whole password.
 *
 * This module is imported by client components as well, so it must stay free
 * of Node.js APIs.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_RULES_TEXT =
  'Mindestens 12 Zeichen. Sonderzeichen sind nicht vorgeschrieben – eine lange Passphrase oder ein Passwortmanager ist besser.';

/**
 * Passwords from public breach lists and the usual keyboard patterns. Kept
 * short on purpose: a local list is a speed bump, not a replacement for a
 * server-side breach check.
 */
const COMMON_PASSWORDS: readonly string[] = [
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123456789012345',
  '1234567890123456',
  'password1234',
  'passwort1234',
  'password12345',
  'passwort12345',
  'qwertzuiop12',
  'qwertyuiop12',
  'abcdefghijkl',
  'abcd1234abcd',
  'iloveyou1234',
  'welcome12345',
  'admin1234567',
  'administrator',
  'letmein12345',
  'sommer2024',
  'sommer2025',
  'sommer2026',
  'winter2024',
  'winter2025',
  'winter2026',
  'frühling2026',
  'fruhling2026',
  'herbst2025',
  'herbst2026',
  'weihnachten',
  'geburtstag',
  'schatz123456',
  'liebe1234567',
  'webradio1234',
  'webradio2026',
  'radio1234567',
  'internetradio',
  'yoursecret123',
  'changeme1234',
  'default12345',
  'test12345678',
  'hallo1234567',
  'monkey123456',
  'dragon123456',
  'sunshine1234',
  'princess1234',
  'football1234',
  'baseball1234',
  'superman1234',
  'starwars1234',
  'trustno12345',
  'master123456',
  'shadow123456',
  'michael12345',
  'jennifer1234',
  'computer1234',
  'internet1234',
  'samsung12345',
  'google123456',
  'facebook1234',
  'instagram12',
  'whatsapp1234',
  'telegram1234',
  'discord12345',
  'minecraft123',
  'fortnite1234',
  'pokemon12345',
  'gaming123456',
  'musik1234567',
  'musikisttoll',
  'geheim123456',
  'sicher123456',
  'passwort123',
  'passwort123456',
  'kennwort1234',
];

/** Lowercase and drop everything that is not a letter or digit. */
export function normalizeForBlocklist(value: string): string {
  return value
    .toLowerCase()
    // German ß has no decomposition, so map it explicitly; otherwise
    // "Grüße" and "Gruesse" would not be treated as the same word.
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * True for a known-common password, also when it only differs by a trailing
 * year or a short digit suffix ("sommer2026", "webradio24"). Removing digits
 * must not turn a real word into a match by accident, so the remainder has to
 * keep at least four characters.
 */
export function isCommonPassword(value: string): boolean {
  const normalized = normalizeForBlocklist(value);
  if (normalized.length === 0) {
    return false;
  }

  if (COMMON_PASSWORDS.includes(normalized)) {
    return true;
  }

  const withoutTrailingDigits = normalized.replace(/[0-9]+$/, '');
  return (
    withoutTrailingDigits.length >= 4 &&
    withoutTrailingDigits !== normalized &&
    COMMON_PASSWORDS.includes(withoutTrailingDigits)
  );
}

/**
 * All problems with a password, in the order a visitor should read them.
 * An empty array means the password is acceptable.
 */
export function validatePassword(value: string): string[] {
  const problems: string[] = [];
  const length = Array.from(value).length;

  if (length < PASSWORD_MIN_LENGTH) {
    problems.push(
      `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`,
    );
  }

  if (length > PASSWORD_MAX_LENGTH) {
    problems.push(
      `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
    );
  }

  if (isCommonPassword(value)) {
    problems.push(
      'Dieses Passwort ist zu verbreitet. Bitte wähle ein anderes.',
    );
  }

  return problems;
}

export function isPasswordAcceptable(value: string): boolean {
  return validatePassword(value).length === 0;
}
