import type { Metadata } from 'next';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalReadiness, privacySections } from '@/lib/legal';

export function generateMetadata(): Metadata {
  const { publishable } = getLegalReadiness();
  return {
    title: 'Datenschutz',
    description:
      'Informationen zur Datenverarbeitung dieser Website. Die Seite wird erst freigegeben, wenn die tatsächlichen Verarbeitungen und Pflichtangaben bestätigt sind.',
    robots: publishable ? undefined : { index: false, follow: false },
  };
}

export default function DatenschutzPage() {
  const readiness = getLegalReadiness();

  return (
    <LegalDocument
      title="Datenschutzerklärung"
      description="Beschreibung der tatsächlichen Datenverarbeitung dieser Website einschließlich Hosting, Datenbank, Sitzungen und Sicherheitsprotokollen."
      readiness={readiness}
      sections={readiness.publishable ? privacySections(readiness.operator!) : []}
    />
  );
}
