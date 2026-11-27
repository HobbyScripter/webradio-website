/**
 * @jest-environment node
 *
 * B4 — every message key the translation admin UI uses must exist in all seven
 * catalogues. The generic completeness test covers key parity; this one pins the
 * keys that were missing (the protected-approval error and the quota states) so
 * a future edit cannot silently drop them again.
 */
import { LOCALES } from '../config';
import { MESSAGES } from '../messages';

const REQUIRED_KEYS = [
  'admin.translationsErrorNotConfigured',
  'admin.translationsErrorApprovedProtected',
  'admin.translationsQuotaUnconfigured',
  'admin.translationsQuotaError',
] as const;

function lookup(tree: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, part) => {
      if (node && typeof node === 'object' && part in node) {
        return (node as Record<string, unknown>)[part];
      }
      return undefined;
    }, tree);
}

describe('translation admin keys', () => {
  it.each(LOCALES)('are present and non-empty in %s', (locale) => {
    for (const key of REQUIRED_KEYS) {
      const value = lookup(MESSAGES[locale], key);
      expect(typeof value).toBe('string');
      expect(String(value).trim().length).toBeGreaterThan(0);
    }
  });

  it('uses the same placeholders in every language', () => {
    for (const key of REQUIRED_KEYS) {
      const placeholders = LOCALES.map((locale) =>
        [...String(lookup(MESSAGES[locale], key)).matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1])
          .sort(),
      );
      for (const entry of placeholders) {
        expect(entry).toEqual(placeholders[0]);
      }
    }
  });

  it('explains the protected-approval case in German', () => {
    expect(String(lookup(MESSAGES.de, 'admin.translationsErrorApprovedProtected'))).toContain(
      'freigegeben',
    );
  });
});
