import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { absoluteUrl, getSiteUrl, SITE_NAME } from '@/lib/site';
import { AnalyticsBeacon } from '@/components/analytics-beacon';
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, parseLocale } from '@/i18n/config';
import { getMergedMessages } from '@/i18n/messages';
import { I18nProvider } from '@/i18n/provider';
import { createServerI18n } from '@/i18n/server';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl = getSiteUrl();
const socialImage = absoluteUrl('/brand/webradio-logo.png');

/**
 * Every locale is prerendered. Adding a language to `LOCALES` is enough for it
 * to get static pages, a language selector entry and a sitemap section.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Site-wide metadata for the active locale.
 *
 * Canonical URLs and `hreflang` alternates are page-level concerns: this layout
 * only provides language-dependent defaults, so a page that knows its own path
 * adds the alternates through `src/lib/seo.ts` instead of inheriting a wrong
 * canonical from the root.
 */
export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);
  const title = t('meta.siteTitle');
  const description = t('meta.siteDescription');

  return {
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    title: {
      default: title,
      template: `%s · ${SITE_NAME}`,
    },
    description,
    applicationName: SITE_NAME,
    keywords: [
      'WebRadio',
      'Open Source',
      'Internetradio',
      'Internet radio',
      'Audio-Streaming',
      'Plugins',
      'Themes',
      'Electron',
      'FFmpeg',
      'Windows',
      'Linux',
    ],
    category: 'technology',
    openGraph: {
      type: 'website',
      locale: LOCALE_META[locale].openGraph,
      alternateLocale: LOCALES.filter((entry) => entry !== locale).map(
        (entry) => LOCALE_META[entry].openGraph,
      ),
      siteName: SITE_NAME,
      title,
      description,
      ...(socialImage
        ? {
            images: [
              {
                url: socialImage,
                width: 256,
                height: 256,
                alt: 'WebRadio',
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
      ...(socialImage ? { images: [socialImage] } : {}),
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#07070a',
  colorScheme: 'dark',
};

export default async function RootLayout({ children, params }: LayoutProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) {
    // Unknown first segment: a real 404 instead of rendering the site in German
    // under a language that does not exist.
    notFound();
  }

  const meta = LOCALE_META[locale];
  const { t } = createServerI18n(locale);
  const messages = getMergedMessages(locale);

  return (
    <html
      lang={meta.code}
      dir={meta.direction}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#07070a] text-zinc-100">
        <I18nProvider locale={locale} messages={messages}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            {t('header.skipToContent')}
          </a>
          {children}
          <AnalyticsBeacon />
        </I18nProvider>
      </body>
    </html>
  );
}
