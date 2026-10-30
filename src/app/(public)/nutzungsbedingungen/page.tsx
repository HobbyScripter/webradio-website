import type { Metadata } from 'next';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, termsSections } from '@/lib/legal';

export function generateMetadata(): Metadata {
  const { complete } = getLegalDetails();
  return {
    title: 'Nutzungsregeln',
    description: 'Regeln für Konten, Entwickleranträge und eingereichte Kataloginhalte.',
    // The page is always reachable; only a text whose required operator details
    // are still missing stays out of search indexes.
    robots: complete ? undefined : { index: false, follow: false },
  };
}

export default function NutzungsbedingungenPage() {
  const details = getLegalDetails();

  return (
    <LegalDocument
      title="Nutzungsregeln"
      description="Verbindliche Regeln für Konten, Entwicklerzugang, eingereichte Inhalte, Meldungen und mögliche Maßnahmen."
      details={details}
      sections={details.complete ? termsSections(details.operator) : []}
    />
  );
}
