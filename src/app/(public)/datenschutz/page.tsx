import type { Metadata } from 'next';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, privacySections } from '@/lib/legal';

export function generateMetadata(): Metadata {
  const { complete } = getLegalDetails();
  return {
    title: 'Datenschutz',
    description: 'Informationen zur Datenverarbeitung dieser Website.',
    // The page is always reachable; only a text whose required operator details
    // are still missing stays out of search indexes.
    robots: complete ? undefined : { index: false, follow: false },
  };
}

export default function DatenschutzPage() {
  const details = getLegalDetails();

  return (
    <LegalDocument
      title="Datenschutzerklärung"
      description="Beschreibung der tatsächlichen Datenverarbeitung dieser Website einschließlich Hosting, Datenbank, Sitzungen und Sicherheitsprotokollen."
      details={details}
      sections={details.complete ? privacySections(details.operator) : []}
    />
  );
}
