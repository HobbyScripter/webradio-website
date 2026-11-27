import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, termsSections } from '@/lib/legal';
import { getCachedLegalDocument } from '@/lib/cached-content';
import { TERMS_LABEL } from '@/lib/legal-labels';
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
    path: '/nutzungsbedingungen',
    title: t('footer.terms'),
    description: t('meta.siteDescription'),
    robots: complete ? undefined : { index: false, follow: false },
  });
}

export default async function NutzungsbedingungenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (process.env['NODE_ENV'] !== 'test') {
    await connection();
  }
  const details = getLegalDetails();
  const locale = await getLocaleFromParams(params);
  const published =
    process.env['NEXT_PHASE'] === 'phase-production-build'
      ? null
      : await getCachedLegalDocument('NUTZUNGSBEDINGUNGEN', locale);

  return (
    <LegalDocument
      title={TERMS_LABEL}
      description="Verbindliche Regeln für Konten, Entwicklerzugang, eingereichte Inhalte, Meldungen und mögliche Maßnahmen."
      details={details}
      sections={details.complete ? termsSections(details.operator) : []}
      content={published?.content ?? null}
    />
  );
}
