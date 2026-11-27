/**
 * Validation of a post-switch redirect target.
 *
 * A language switch must return to the page it was triggered on, but a
 * user-supplied path is a classic open-redirect sink. Only a site-relative path
 * with exactly one leading slash is accepted; the locale prefix is removed so
 * the caller can re-attach the newly chosen one.
 */
import { stripLocale } from './config';

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) {
    return '/';
  }
  const value = raw.trim();
  if (!value.startsWith('/')) {
    return '/';
  }
  // Protocol-relative (`//evil.example`) and the `/\` browser quirk.
  if (value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  // Control characters can smuggle a header or a scheme past naive parsers.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return '/';
  }
  return stripLocale(value);
}
