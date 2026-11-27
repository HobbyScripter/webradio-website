import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, isMailDeliveryConfigured, privacySections } from '@/lib/legal';
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
    path: '/datenschutz',
    title: t('footer.privacy'),
    description: t('meta.siteDescription'),
    robots: complete ? undefined : { index: false, follow: false },
  });
}

export default async function DatenschutzPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env['NODE_ENV'] !== 'test') {
    await connection();
  }
  const details = getLegalDetails();
  const locale = await getLocaleFromParams(params);
  const published =
    process.env['NEXT_PHASE'] === 'phase-production-build'
      ? null
      : await getCachedLegalDocument('DATENSCHUTZ', locale);

  return (
    <LegalDocument
      title="Datenschutzerklärung"
      description="Welche Daten diese Website verarbeitet, zu welchem Zweck und wie lange."
      details={details}
      sections={
        details.complete ? privacySections(details.operator, isMailDeliveryConfigured()) : []
      }
      content={published?.content ?? null}
    />
  );
}
