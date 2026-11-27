import { Suspense } from 'react';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import LegalConsentNotice from '@/components/public/LegalConsentNotice';
import { DEFAULT_LOCALE, parseLocale } from '@/i18n/config';

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;

  return (
    <div className="flex min-h-dvh flex-col bg-[#07070a]">
      <Header locale={locale} />
      <Suspense fallback={null}>
        <LegalConsentNotice />
      </Suspense>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer locale={locale} />
    </div>
  );
}
