'use client';

/**
 * Client-side i18n context.
 *
 * The `[locale]` layout resolves the locale on the server, merges the locale
 * bundle with the German source (so a missing key can never surface as a raw
 * key in the UI) and passes it down once. Client components therefore translate
 * synchronously and render identical markup on the server and during
 * hydration — there is no locale state to restore and no hydration mismatch.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './config';
import { createFormatters, type LocaleFormatters } from './format';
import { createTranslator, type MessageTree, type TranslationValues } from './translate';
import de from './messages/de.json';

/**
 * Fallback for a component rendered outside the provider (tests, isolated
 * stories): the German source, so a key never surfaces instead of text. The
 * production tree always comes from the `[locale]` layout.
 */
const FALLBACK_MESSAGES = de as MessageTree;

export type I18nValue = {
  locale: Locale;
  t: (key: string, values?: TranslationValues) => string;
  format: LocaleFormatters;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: MessageTree;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      // Messages arrive already merged with the German fallback, so the same
      // bundle is used as its own fallback and lookup stays a single pass.
      t: createTranslator(locale, messages, messages),
      format: createFormatters(locale),
    }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The active locale. Safe outside a provider: it falls back to German so a
 * component rendered in isolation (a test, a story) never crashes.
 */
export function useLocale(): Locale {
  return useContext(I18nContext)?.locale ?? 'de';
}

/** Translator plus formatters for the active locale. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  return (
    value ?? {
      locale: 'de',
      t: createTranslator('de', FALLBACK_MESSAGES, FALLBACK_MESSAGES),
      format: createFormatters('de'),
    }
  );
}
