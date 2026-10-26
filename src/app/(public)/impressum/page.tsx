import type { Metadata } from 'next';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalReadiness, impressumSections } from '@/lib/legal';

export function generateMetadata(): Metadata {
  const { publishable } = getLegalReadiness();
  return {
    title: 'Impressum',
    description:
      'Anbieterangaben für diese Website. Ohne vollständige Pflichtangaben bleibt die Seite gesperrt, statt Platzhalter zu veröffentlichen.',
    robots: publishable ? undefined : { index: false, follow: false },
  };
}

export default function ImpressumPage() {
  const readiness = getLegalReadiness();

  return (
    <LegalDocument
      title="Impressum"
      description="Anbieterangaben gemäß § 5 DDG. Die Seite wird erst freigegeben, wenn alle Pflichtangaben vorliegen und der Text geprüft ist."
      readiness={readiness}
      sections={readiness.publishable ? impressumSections(readiness.operator!) : []}
    />
  );
}
