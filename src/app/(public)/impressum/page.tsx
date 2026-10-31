import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, impressumSections } from '@/lib/legal';
import { getPublishedLegalDocument } from '@/lib/legal-document-service';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { complete } = getLegalDetails();
  return {
    title: 'Impressum',
    description: 'Anbieterangaben für diese Website gemäß § 5 DDG.',
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
      : await getPublishedLegalDocument('IMPRESSUM');

  return (
    <LegalDocument
      title="Impressum"
      description="Anbieterangaben gemäß § 5 DDG."
      details={details}
      sections={details.complete ? impressumSections(details.operator) : []}
      content={published?.content ?? null}
    />
  );
}