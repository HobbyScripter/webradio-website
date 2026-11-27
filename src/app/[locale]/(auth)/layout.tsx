import type { Metadata } from 'next';
import Link from '@/i18n/navigation';
import { DEFAULT_LOCALE, parseLocale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
import LanguageSelector from '@/components/i18n/LanguageSelector';

type AuthLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: AuthLayoutProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  return {
    title: t('auth.accountTitle'),
    robots: { index: false, follow: false },
    // Password-reset and verification links carry a one-time token in the URL.
    // The browser must not send that URL to any other origin as a Referer.
    referrer: 'no-referrer',
  };
}

export default async function AuthLayout({ children, params }: AuthLayoutProps) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  return (
    <main
      id="main-content"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#07070a] px-4 py-12"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-violet-600/15 via-indigo-600/10 to-transparent blur-[140px]" />

      {/* Brand Header */}
      <div className="relative z-10 mb-8 flex flex-col items-center gap-4 text-center">
        <Link href="/" className="group inline-flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-fuchsia-500 shadow-lg shadow-violet-500/25 transition-all group-hover:scale-105">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">WebRadio</span>
        </Link>

        <LanguageSelector variant="footer" className="w-52" />
      </div>

      {/* Main Auth Container */}
      <div className="relative z-10 w-full max-w-md">{children}</div>

      {/* Back Link */}
      <div className="relative z-10 mt-8 text-center text-xs text-zinc-500">
        <Link href="/" className="transition-colors hover:text-zinc-300">
          &larr; {t('auth.backHome')}
        </Link>
      </div>

      {/* Legal pages stay reachable without an account */}
      <nav
        aria-label={t('auth.legalAria')}
        className="relative z-10 mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500"
      >
        <Link href="/impressum" className="transition-colors hover:text-zinc-300">
          {t('auth.impressum')}
        </Link>
        <Link href="/datenschutz" className="transition-colors hover:text-zinc-300">
          {t('auth.privacy')}
        </Link>
      </nav>
    </main>
  );
}
