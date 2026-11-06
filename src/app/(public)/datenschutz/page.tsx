import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, isMailDeliveryConfigured, privacySections } from '@/lib/legal';
import { getCachedLegalDocument } from '@/lib/cached-content';
import { defaultSocialImages } from '@/lib/metadata';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { complete } = getLegalDetails();
  return {
    title: 'Datenschutz',
    description:
      'Welche Daten diese Website verarbeitet: Konto, Sitzung, Sicherheitsprotokoll, Missbrauchsschutz und Meldungen.',
    openGraph: {
      title: 'Datenschutz · WebRadio',
      description:
        'Welche Daten diese Website verarbeitet: Konto, Sitzung, Sicherheitsprotokoll, Missbrauchsschutz und Meldungen.',
      images: defaultSocialImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Datenschutz · WebRadio',
      description:
        'Welche Daten diese Website verarbeitet: Konto, Sitzung, Sicherheitsprotokoll, Missbrauchsschutz und Meldungen.',
    },
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
      : await getCachedLegalDocument('DATENSCHUTZ');

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
