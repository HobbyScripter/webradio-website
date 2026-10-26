import type { Metadata } from 'next';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalReadiness, termsSections } from '@/lib/legal';

export function generateMetadata(): Metadata {
  const { publishable } = getLegalReadiness();
  return {
    title: 'Nutzungsregeln',
    description:
      'Regeln für Konten, Entwickleranträge und eingereichte Kataloginhalte. Die Seite wird erst nach rechtlicher Prüfung freigegeben.',
    robots: publishable ? undefined : { index: false, follow: false },
  };
}

export default function NutzungsbedingungenPage() {
  const readiness = getLegalReadiness();

  return (
    <LegalDocument
      title="Nutzungsregeln"
      description="Verbindliche Regeln für Konten, Entwicklerzugang, eingereichte Inhalte, Meldungen und mögliche Maßnahmen."
      readiness={readiness}
      sections={readiness.publishable ? termsSections(readiness.operator!) : []}
    />
  );
}
