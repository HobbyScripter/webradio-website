import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import ContactForm from '@/components/public/ContactForm';
import { getLegalDetails, impressumSections } from '@/lib/legal';
import { isContactFormEnabled } from '@/lib/contact';
import { getCachedLegalDocument } from '@/lib/cached-content';
import { pageMetadata } from '@/lib/seo';
import { createServerI18n, getLocaleFromParams } from '@/i18n/server';

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { complete } = getLegalDetails();
  const locale = await getLocaleFromParams(params);
  const { t } = createServerI18n(locale);
  return pageMetadata({
    locale,
    path: '/impressum',
    title: t('footer.impressum'),
    description: t('meta.siteDescription'),
    robots: complete ? undefined : { index: false, follow: false },
  });
}

export default async function ImpressumPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env['NODE_ENV'] !== 'test') {
    await connection();
  }
  const details = getLegalDetails();
  const locale = await getLocaleFromParams(params);
  const published =
    process.env['NEXT_PHASE'] === 'phase-production-build'
      ? null
      : await getCachedLegalDocument('IMPRESSUM', locale);

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
