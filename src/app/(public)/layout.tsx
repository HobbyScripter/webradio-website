import { Suspense } from 'react';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import LegalConsentNotice from '@/components/public/LegalConsentNotice';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#07070a]">
      <Header />
      <Suspense fallback={null}>
        <LegalConsentNotice />
      </Suspense>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
