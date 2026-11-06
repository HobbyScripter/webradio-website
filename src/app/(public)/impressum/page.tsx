import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import ContactForm from '@/components/public/ContactForm';
import { getLegalDetails, impressumSections } from '@/lib/legal';
import { isContactFormEnabled } from '@/lib/contact';
import { getCachedLegalDocument } from '@/lib/cached-content';
import { defaultSocialImages } from '@/lib/metadata';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { complete } = getLegalDetails();
  return {
    title: 'Impressum',
    description: 'Anbieterangaben für diese Website gemäß § 5 DDG.',
    openGraph: {
      title: 'Impressum · WebRadio',
      description: 'Anbieterangaben für diese Website gemäß § 5 DDG.',
      images: defaultSocialImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Impressum · WebRadio',
      description: 'Anbieterangaben für diese Website gemäß § 5 DDG.',
    },
    robots: complete ? undefined : { index: false, follow: false },
  };
}

export default async function ImpressumPage() {
  if (process.env['NODE_ENV'] !== 'test') {
    await connection();
  }
  const details = getLegalDetails();
  const published =
    process.env['NEXT_PHASE'] === 'phase-production-build'
      ? null
      : await getCachedLegalDocument('IMPRESSUM');

  return (
    <>
      <LegalDocument
        title="Impressum"
        description="Anbieterangaben gemäß § 5 DDG."
        details={details}
        sections={details.complete ? impressumSections(details.operator) : []}
        content={published?.content ?? null}
      />
      {isContactFormEnabled() ? (
        <div className="mx-auto -mt-16 w-full max-w-3xl px-4 sm:px-6 lg:px-8">
          <ContactForm />
        </div>
      ) : null}
    </>
  );
}
