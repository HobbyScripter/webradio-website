import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, privacySections } from '@/lib/legal';
import { getPublishedLegalDocument } from '@/lib/legal-document-service';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { complete } = getLegalDetails();
  return {
    title: 'Datenschutz',
    description: 'Informationen zur Datenverarbeitung dieser Website.',
    robots: complete ? undefined : { index: false, follow: false },
  };
}

export default async function DatenschutzPage() {
  if (process.env['NODE_ENV'] !== 'test') {
    await connection();
  }
  const details = getLegalDetails();
  const published =
    process.env['NEXT_PHASE'] === 'phase-production-build'
      ? null
      : await getPublishedLegalDocument('DATENSCHUTZ');

  return (
    <LegalDocument
      title="Datenschutzerklärung"
      description="Beschreibung der tatsächlichen Datenverarbeitung dieser Website einschließlich Hosting, Datenbank, Sitzungen und Sicherheitsprotokollen."
      details={details}
      sections={details.complete ? privacySections(details.operator) : []}
      content={published?.content ?? null}
    />
  );
}