import type { Metadata } from 'next';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, impressumSections } from '@/lib/legal';

export function generateMetadata(): Metadata {
  const { complete } = getLegalDetails();
  return {
    title: 'Impressum',
    description: 'Anbieterangaben für diese Website gemäß § 5 DDG.',
    // The page is always reachable; only a text whose required operator details
    // are still missing stays out of search indexes.
    robots: complete ? undefined : { index: false, follow: false },
  };
}

export default function ImpressumPage() {
  const details = getLegalDetails();

  return (
    <LegalDocument
      title="Impressum"
      description="Anbieterangaben gemäß § 5 DDG."
      details={details}
      sections={details.complete ? impressumSections(details.operator) : []}
    />
  );
}
