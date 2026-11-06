import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalDocument from '@/components/public/LegalDocument';
import { getLegalDetails, termsSections } from '@/lib/legal';
import { getCachedLegalDocument } from '@/lib/cached-content';
import { TERMS_LABEL } from '@/lib/legal-labels';
import { defaultSocialImages } from '@/lib/metadata';

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { complete } = getLegalDetails();
  return {
    title: TERMS_LABEL,
    description: 'Regeln für Konten, Entwickleranträge und eingereichte Kataloginhalte.',
    openGraph: {
      title: `${TERMS_LABEL} · WebRadio`,
      description: 'Regeln für Konten, Entwickleranträge und eingereichte Kataloginhalte.',
      images: defaultSocialImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${TERMS_LABEL} · WebRadio`,
      description: 'Regeln für Konten, Entwickleranträge und eingereichte Kataloginhalte.',
    },
    robots: complete ? undefined : { index: false, follow: false },
  };
}

export default async function NutzungsbedingungenPage() {
  if (process.env['NODE_ENV'] !== 'test') {
    await connection();
  }
  const details = getLegalDetails();
  const published =
    process.env['NEXT_PHASE'] === 'phase-production-build'
      ? null
      : await getCachedLegalDocument('NUTZUNGSBEDINGUNGEN');

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
