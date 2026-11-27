/**
 * Pure translation engine — no React, no Next.js, no side effects.
 *
 * Keeping this module dependency-free means the same lookup logic runs on the
 * server (`getI18n()`), in client components (`useI18n()`) and in unit tests,
 * and that e-mail templates can be rendered outside a request context.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config';

export type MessageValue = string | MessageTree;
export type MessageTree = { [key: string]: MessageValue };

export type TranslationValues = Record<string, string | number>;

/** Dot-path keys of a message tree, e.g. `nav.plugins`. */
export type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends MessageTree
      ? `${K}.${MessageKey<T[K]>}`
      : never;
}[keyof T & string];

/** Resolve `a.b.c` in a nested object. Returns undefined for a missing path. */
export function lookupPath(tree: MessageTree, key: string): string | undefined {
  const segments = key.split('.');
  let current: MessageValue | undefined = tree;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace `{name}` placeholders. An unknown placeholder is left untouched so a
 * visibly wrong string is easier to spot than a silently empty one.
 */
export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export type Translator = (key: string, values?: TranslationValues) => string;

/**
 * Create a translator for one locale.
 *
 * Resolution order for a single key: requested locale → default locale (German)
 * → the key itself. A missing translation is therefore visible but never
 * breaks a page, and the fallback language is always the authoritative German
 * source rather than an unrelated third language.
 */
export function createTranslator(
  locale: Locale,
  messages: MessageTree,
  fallbackMessages: MessageTree,
): Translator {
  return (key, values) => {
    const direct = lookupPath(messages, key);
    if (direct !== undefined) {
      return interpolate(direct, values);
    }
    const fallback = lookupPath(fallbackMessages, key);
    if (fallback !== undefined) {
      return interpolate(fallback, values);
    }
    if (process.env['NODE_ENV'] !== 'production') {
      // Development/build visibility for an untranslated or mistyped key.
      console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    }
    return key;
  };
}

/** Every leaf path in a tree, in stable order. Used by the coverage checks. */
export function collectKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      keys.push(path);
    } else {
      keys.push(...collectKeys(value, path));
    }
  }
  return keys.sort();
}

/**
 * Compare one locale against the source language.
 *
 * Returns keys that exist only in the source (`missing`) and keys that the
 * locale defines but the source does not (`extra`, usually a typo or a
 * leftover). Empty arrays mean the locale is structurally complete.
 */
export function compareMessages(
  source: MessageTree,
  candidate: MessageTree,
): { missing: string[]; extra: string[] } {
  const sourceKeys = new Set(collectKeys(source));
  const candidateKeys = new Set(collectKeys(candidate));

  return {
    missing: [...sourceKeys].filter((key) => !candidateKeys.has(key)),
    extra: [...candidateKeys].filter((key) => !sourceKeys.has(key)),
  };
}

/** Locales whose tree is structurally identical to the German source. */
export function incompleteLocales(
  dictionary: Record<Locale, MessageTree>,
): Record<Locale, string[]> {
  const result = {} as Record<Locale, string[]>;
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) {
      continue;
    }
    result[locale] = compareMessages(dictionary[DEFAULT_LOCALE], dictionary[locale]).missing;
  }
  return result;
}
