'use client';

/**
 * Language selector.
 *
 * A native `<select>` inside a real `<form>`: it works without JavaScript
 * (the submit button inside `<noscript>`), survives hydration, needs no client
 * state and is keyboard/screen-reader accessible by default. With JavaScript,
 * choosing an option submits the form immediately.
 *
 * The chosen language is stored by `POST /api/locale` (cookie, and the account
 * when signed in), which then redirects back to the same page in the new
 * language.
 */
import { useId } from 'react';
import { LOCALES, LOCALE_META } from '@/i18n/config';
import { usePathname } from '@/i18n/navigation';
import { useI18n } from '@/i18n/provider';

type Variant = 'header' | 'footer' | 'account';

const SELECT_CLASSES: Record<Variant, string> = {
  header:
    'rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 pl-2.5 pr-7 text-sm font-medium text-zinc-200 transition-colors hover:border-white/[0.14] hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
  footer:
    'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
  account:
    'w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 transition-colors hover:border-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
};

export default function LanguageSelector({
  variant = 'header',
  showLabel = true,
  className = '',
}: {
  variant?: Variant;
  /** Render a visible label above the control (footer/account variants). */
  showLabel?: boolean;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const selectId = useId();

  return (
    <form
      method="post"
      action="/api/locale"
      className={className}
      // The control is a real form so it also works with JavaScript disabled.
      data-testid="language-selector"
    >
      <input type="hidden" name="next" value={pathname} />

      {showLabel ? (
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500"
        >
          {t('language.label')}
        </label>
      ) : (
        <label htmlFor={selectId} className="sr-only">
          {t('language.select')}
        </label>
      )}

      <div className="flex items-center gap-2">
        <select
          id={selectId}
          name="locale"
          defaultValue={locale}
          aria-label={t('language.select')}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className={SELECT_CLASSES[variant]}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code} className="bg-[#07070a] text-zinc-100">
              {LOCALE_META[code].flag} {LOCALE_META[code].nativeName}
            </option>
          ))}
        </select>

        <noscript>
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
          >
            {t('common.save')}
          </button>
        </noscript>
      </div>
    </form>
  );
}
