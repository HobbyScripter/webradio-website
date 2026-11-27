import type { Metadata } from 'next';
import Link from '@/i18n/navigation';
import { Container, PageHeader, SectionHeading } from '@/components/ui/layout';
import { AdvertisingForm } from './AdvertisingForm';
import { ArrowRightIcon, LayersIcon } from '@/components/ui/icons';
import { pageMetadata } from '@/lib/seo';
import { createServerI18n, getLocaleFromParams } from '@/i18n/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { t } = createServerI18n(locale);
  return pageMetadata({
    locale,
    path: '/advertising',
    title: t('footer.advertising'),
    description: t('meta.siteDescription'),
  });
}

const OFFERS = [
  {
    title: 'Bannerwerbung',
    description: 'Sichtbare Banner auf unserer Startseite und der Download-Seite.',
  },
  {
    title: 'Sponsorenkarte',
    description: 'Erwähnung als offizieller Sponsor mit Logo und Verlinkung.',
  },
  {
    title: 'Unternehmenslogo',
    description: 'Ihr Logo mit direkter Verlinkung zu Ihrer Website.',
  },
  {
    title: 'Individuelle Anfrage',
    description: 'Maßgeschneiderte Sponsoringlösungen für Ihre Anforderungen.',
  },
];

const STEPS = [
  'Formular ausfüllen',
  'Prüfung innerhalb von 5 Werktagen',
  'Rückmeldung und Detailabstimmung',
  'Kampagne wird angelegt und freigegeben',
  'Auslieferung mit Impression- und Klickmessung',
];

export default function AdvertisingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Werbung"
        title="Werbung & Sponsoring"
        description="Erreichen Sie eine technisch interessierte Community — ohne Tracking-Cookies und ohne Streuverlust."
      />

      <Container className="space-y-16 py-14 sm:py-16">
        <section aria-labelledby="advertising-offers">
          <SectionHeading
            id="advertising-offers"
            title="Unsere Werbemöglichkeiten"
            description="Alle Formate laufen auf festen Plätzen der Website und werden manuell freigegeben."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            {OFFERS.map((offer) => (
              <div
                key={offer.title}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-300">
                  <LayersIcon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{offer.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{offer.description}</p>
              </div>
            ))}
          </div>
          <Link
            href="/partners"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Unsere bestehenden Partner kennenlernen <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </section>

        <section aria-labelledby="advertising-process">
          <SectionHeading
            id="advertising-process"
            title="Der Bewerbungsablauf"
            description="Transparent von der Anfrage bis zur Auslieferung."
          />
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm text-zinc-300"
              >
                <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-xs font-semibold text-violet-300">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="advertising-privacy">
          <SectionHeading
            id="advertising-privacy"
            title="Datenschutz"
            description="Ihre Bewerbungsdaten werden ausschließlich zur Bearbeitung Ihrer Anfrage verwendet."
          />
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            Wir speichern Ihre Angaben nicht länger als für die Bearbeitung erforderlich und geben
            sie nicht an Dritte weiter. Für die Auslieferung zählen wir ausschließlich aggregierte
            Impressionen und Klicks pro Tag — ohne Profile und ohne Cookies.
          </p>
          <Link
            href="/datenschutz"
            className="mt-3 inline-flex text-sm font-medium text-violet-300 hover:text-violet-200"
          >
            Datenschutzerklärung anzeigen
          </Link>
        </section>

        <section
          id="bewerbung"
          aria-labelledby="advertising-form"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 sm:p-8"
        >
          <SectionHeading
            id="advertising-form"
            title="Bewerbungsformular"
            description="Alle mit * markierten Felder sind Pflichtfelder."
          />
          <AdvertisingForm />
        </section>
      </Container>
    </>
  );
}
