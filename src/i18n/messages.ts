/**
 * Message catalogue.
 *
 * Every locale is a plain JSON file next to this module. TypeScript checks the
 * key paths through `MessageTree`/`MessageKey`, and `src/i18n/__tests__` fails
 * when a locale drifts from the German source.
 *
 * The catalogues are statically imported, so a locale's messages are part of
 * the server bundle and are serialised to the client exactly once per page
 * load through the provider — no extra request and no per-component fetch.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config';
import { createTranslator, type MessageKey, type MessageTree, type Translator } from './translate';

import de from './messages/de.json';
import en from './messages/en.json';
import es from './messages/es.json';
import fr from './messages/fr.json';
import it from './messages/it.json';
import nl from './messages/nl.json';
import pl from './messages/pl.json';

export const MESSAGES: Record<Locale, MessageTree> = {
  de: de as MessageTree,
  en: en as MessageTree,
  nl: nl as MessageTree,
  fr: fr as MessageTree,
  es: es as MessageTree,
  it: it as MessageTree,
  pl: pl as MessageTree,
};

/** All valid translation keys, derived from the German source. */
export type TranslationKey = MessageKey<typeof de>;

/** Messages for one locale, falling back to the German source bundle. */
export function getMessages(locale: Locale): MessageTree {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}

/** Translator for a locale. */
export function getTranslator(locale: Locale): Translator {
  return createTranslator(locale, getMessages(locale), MESSAGES[DEFAULT_LOCALE]);
}

const mergedCache = new Map<Locale, MessageTree>();

/**
 * Merge a locale over the German source into one flat-resolved tree.
 *
 * The client provider receives this object, so a key that is missing in a
 * translation still renders German on the client — without shipping a second
 * full catalogue or repeating the fallback in every component.
 * Cached per locale for the lifetime of the server process.
 */
export function getMergedMessages(locale: Locale): MessageTree {
  if (locale === DEFAULT_LOCALE) {
    return MESSAGES[DEFAULT_LOCALE];
  }

  const cached = mergedCache.get(locale);
  if (cached) {
    return cached;
  }

  const merge = (source: MessageTree, override: MessageTree): MessageTree => {
    const result: MessageTree = {};
    for (const [key, value] of Object.entries(source)) {
      const candidate = override[key];
      if (typeof value === 'string') {
        result[key] = typeof candidate === 'string' && candidate.length > 0 ? candidate : value;
      } else {
        result[key] = merge(
          value,
          typeof candidate === 'object' && candidate !== null ? (candidate as MessageTree) : {},
        );
      }
    }
    return result;
  };

  const merged = merge(MESSAGES[DEFAULT_LOCALE], getMessages(locale));
  mergedCache.set(locale, merged);
  return merged;
}

/** Re-exported so callers do not need to import the config separately. */
export { LOCALES, DEFAULT_LOCALE };
