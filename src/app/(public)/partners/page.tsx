import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Container, PageHeader, SectionHeading } from '@/components/ui/layout';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, CatalogueSkeleton } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { PartnerService, type PartnerRelationshipType } from '@/lib/partner/service';
import { calculateDuration, earliestRelationshipStart } from '@/lib/partner/duration';
import { RELATIONSHIP_TYPE } from '@/lib/advertising/labels';
import { formatDate } from '@/lib/format';
import { ArrowRightIcon, GlobeIcon } from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Partner & Sponsoren',
  description: 'Unsere offiziellen Partner und Sponsoren.',
};

type PublicPartner = Awaited<ReturnType<typeof PartnerService.getPublicPartners>>[number];

const SECTIONS: { type: PartnerRelationshipType; title: string; description: string }[] = [
  {
    type: 'OFFICIAL_PARTNER',
    title: 'Offizielle Partner',
    description: 'Unternehmen, die WebRadio dauerhaft begleiten.',
  },
  {
    type: 'SPONSOR',
    title: 'Sponsoren',
    description: 'Partner, die Inhalte und Releases ermöglichen.',
  },
  {
    type: 'TECHNICAL_PARTNER',
    title: 'Technische Partner',
    description: 'Infrastruktur, Hosting und Werkzeuge, auf die wir bauen.',
  },
  {
    type: 'MEDIA_PARTNER',
    title: 'Medienpartner',
    description: 'Redaktionen und Kanäle, die über WebRadio berichten.',
  },
  {
    type: 'STRATEGIC_PARTNER',
    title: 'Strategische Partner',
    description: 'Langfristige Zusammenarbeit an der Weiterentwicklung.',
  },
];

export default function PartnersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Netzwerk"
        title="Partner & Sponsoren"
        description="Die Unternehmen und Menschen, mit denen wir WebRadio gemeinsam weiterentwickeln."
      />

      <Container className="py-14 sm:py-16">
        <Suspense fallback={<CatalogueSkeleton cards={3} />}>
          <PartnerSections />
        </Suspense>
      </Container>

      <section className="border-t border-white/[0.07] bg-white/[0.015]">
        <Container className="py-12 sm:py-14">
          <div className="flex flex-col gap-6 rounded-2xl border border-violet-400/15 bg-violet-500/[0.05] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Sie möchten Partner oder Sponsor von WebRadio werden?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Reichen Sie eine unverbindliche Bewerbung ein – wir prüfen jede Anfrage einzeln
                und melden uns innerhalb von fünf Werktagen.
              </p>
            </div>
            <ButtonLink href="/advertising" className="shrink-0">
              Werbung &amp; Sponsoring <ArrowRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}

async function PartnerSections() {
  // Request-time data: Prisma 8 derives a statement id from crypto randomness,
  // which requires this marker during a Cache Components prerender.
  await connection();
  const partners = await PartnerService.getPublicPartners();

  if (partners.length === 0) {
    return (
      <EmptyState
        title="Noch keine Partner veröffentlicht"
        description="Sobald eine Partnerschaft freigegeben ist, erscheint sie an dieser Stelle. Schau später noch einmal vorbei."
        icon={<GlobeIcon className="h-5 w-5" />}
      />
    );
  }

  return (
    <div className="space-y-16">
      {SECTIONS.map((section) => {
        const sectionPartners = partners.filter((partner) =>
          partner.relationships.some((relationship) => relationship.type === section.type),
        );

        if (sectionPartners.length === 0) {
          return null;
        }

        return (
          <section key={section.type} aria-labelledby={`partners-${section.type}`}>
            <SectionHeading
              id={`partners-${section.type}`}
              title={section.title}
              description={section.description}
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sectionPartners.map((partner) => (
                <PartnerCard key={`${section.type}-${partner.id}`} partner={partner} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PartnerCard({ partner }: { partner: PublicPartner }) {
  // "Partner seit" refers to the first relationship ever, not to the newest one.
  const start = earliestRelationshipStart(partner.relationships);
  const duration = start ? calculateDuration(start) : null;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.14]">
      <div className="mb-4 flex items-start gap-4">
        {partner.logoUrl ? (
          <img
            src={partner.logoUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] object-contain"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-violet-300">
            <GlobeIcon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white">{partner.companyName}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {partner.isFeatured ? <Badge tone="accent">Hauptpartner</Badge> : null}
            {partner.relationships.map((relationship) => (
              <Badge key={relationship.id} tone="neutral">
                {RELATIONSHIP_TYPE[relationship.type] ?? relationship.type}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {partner.description ? (
        <p className="mb-4 text-sm leading-relaxed text-zinc-400">{partner.description}</p>
      ) : null}

      <div className="mt-auto space-y-2">
        {partner.websiteUrl ? (
          <a
            href={partner.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm font-medium text-violet-300 hover:text-violet-200"
          >
            Website besuchen
          </a>
        ) : null}
        {start && duration ? (
          <p className="text-xs text-zinc-500">
            Partner seit {formatDate(start)} · {duration}
          </p>
        ) : null}
      </div>
    </article>
  );
}
