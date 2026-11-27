import Link from '@/i18n/navigation';
import { getI18n, createServerI18n } from '@/i18n/server';
import { DEFAULT_LOCALE } from '@/i18n/config';

/**
 * Localized 404 page.
 *
 * `not-found.tsx` cannot receive route params, so the language comes from the
 * stored cookie (`getI18n()`). This only runs for a miss, so reading the cookie
 * here costs nothing on a successful request.
 */
export default async function NotFound() {
  // Outside a request (a unit test, a prerender probe) the cookie is not
  // readable; German is the safe fallback, never an error page.
  const { t } = await getI18n().catch(() => createServerI18n(DEFAULT_LOCALE));

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-600/10 font-mono text-3xl font-bold text-violet-400 shadow-lg shadow-violet-500/5">
          404
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t('errors.notFoundTitle')}
        </h1>
        <p className="text-base leading-relaxed text-zinc-400">{t('errors.notFoundBody')}</p>
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition-all duration-200 hover:bg-violet-500 active:scale-[0.98]"
          >
            {t('errors.home')}
          </Link>
          <Link
            href="/plugins"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-all duration-200 hover:bg-zinc-800 active:scale-[0.98]"
          >
            {t('errors.notFoundPlugins')}
          </Link>
        </div>
        <nav
          aria-label={t('errors.legalAria')}
          className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-zinc-500"
        >
          <Link href="/impressum" className="hover:text-zinc-300">
            {t('footer.impressum')}
          </Link>
          <Link href="/datenschutz" className="hover:text-zinc-300">
            {t('footer.privacy')}
          </Link>
        </nav>
      </div>
    </div>
  );
}
