'use client';

import { useEffect } from 'react';
import Link from '@/i18n/navigation';
import { useI18n } from '@/i18n/provider';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    // Log client-side error for observability
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 font-mono text-3xl font-bold text-rose-400 shadow-lg shadow-rose-500/5">
          !
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('errors.title')}</h1>
        <p className="text-sm leading-relaxed text-zinc-400">{t('errors.body')}</p>
        {error?.digest && (
          <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2 font-mono text-xs text-zinc-500">
            {t('errors.errorId')}: {error.digest}
          </p>
        )}
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-600/25 transition-all duration-200 hover:bg-rose-500 active:scale-[0.98]"
          >
            {t('errors.retry')}
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-all duration-200 hover:bg-zinc-800 active:scale-[0.98]"
          >
            {t('errors.home')}
          </Link>
        </div>
        <nav
          aria-label={t('errors.legalAria')}
          className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500"
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
