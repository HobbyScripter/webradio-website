import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader, SectionHeading } from '@/components/ui/layout';
import { ArrowRightIcon, CheckIcon, ExternalLinkIcon, PlugIcon } from '@/components/ui/icons';
import { TERMS_LABEL } from '@/lib/legal-labels';
import { defaultSocialImages } from '@/lib/metadata';
import { PRODUCT_PLUGIN_SDK_URL, absoluteUrl } from '@/lib/site';

const TITLE = 'Plugin einreichen';
const DESCRIPTION =
  'So reichst du dein Plugin für den WebRadio-Katalog ein: Ablauf, Anforderungen an Manifest, Lizenz, Vorschau, Version und Kompatibilität.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} · WebRadio`,
    description: DESCRIPTION,
    images: defaultSocialImages(),
    ...(absoluteUrl('/plugin-einreichen')
      ? { url: absoluteUrl('/plugin-einreichen') }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} · WebRadio`,
    description: DESCRIPTION,
  },
  ...(absoluteUrl('/plugin-einreichen')
    ? { alternates: { canonical: absoluteUrl('/plugin-einreichen') } }
    : {}),
};

const STEPS = [
  {
    title: 'Konto erstellen',
    text: 'Für die Einreichung brauchst du ein Konto auf dieser Website. Ein bestehendes Konto kannst du direkt verwenden.',
  },
  {
    title: 'Entwicklerantrag stellen',
    text: 'Im Entwicklerbereich beantragst du den Entwicklerzugang. Nach der Freigabe kannst du Einträge und Versionen anlegen.',
  },
  {
    title: 'Plugin beschreiben',
    text: 'Lege einen Eintrag mit Name, Beschreibung, Tags und einem Link zu Repository oder Projektseite an.',
  },
  {
    title: 'Version veröffentlichen',
    text: 'Lade dein Paket auf einer dauerhaft erreichbaren Adresse ab und trage Version, Kompatibilität, Größe und Prüfsumme ein.',
  },
  {
    title: 'Prüfung und Freigabe',
    text: 'Administratoren prüfen den Eintrag. Nach der Freigabe erscheint dein Plugin im Katalog und auf seiner Detailseite.',
  },
] as const;

const REQUIREMENTS = [
  {
    title: 'Manifest',
    text: 'Eine manifest.json mit eindeutiger Kennung, Name, Version und Einstiegsdatei. Das genaue Format steht im Plugin-SDK.',
  },
  {
    title: 'Lizenz',
    text: 'Eine klare Lizenzangabe, die die Nutzung und Weitergabe des Plugins erlaubt.',
  },
  {
    title: 'Vorschau',
    text: 'Mindestens ein Vorschaubild, das zeigt, was das Plugin im Programm bewirkt.',
  },
  {
    title: 'Version',
    text: 'Eine Versionsnummer nach dem Schema x.y.z. Jede Änderung erhält eine neue Version.',
  },
  {
    title: 'Kompatibilität',
    text: 'Die WebRadio-Version, ab der dein Plugin läuft – und optional die Version, bis zu der es geprüft ist.',
  },
] as const;

export default function PluginSubmitPage() {
  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Plugin einreichen"
        description="Du hast ein Plugin für WebRadio gebaut? Hier erfährst du, wie es in den Katalog kommt – vom Konto bis zur Freigabe."
        actions={
          <>
            <ButtonLink href="/developer">
              Entwicklerbereich (Anmeldung erforderlich)
            </ButtonLink>
            <ButtonLink
              href={PRODUCT_PLUGIN_SDK_URL}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <PlugIcon className="h-4 w-4" /> Plugin-SDK{' '}
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </>
        }
      />

      <Container className="space-y-12 py-10">
        <section aria-labelledby="ablauf-heading">
          <SectionHeading
            id="ablauf-heading"
            eyebrow="Ablauf"
            title="In fünf Schritten in den Katalog"
            description="Jeder Schritt baut auf dem vorherigen auf; du kannst jederzeit pausieren und später weitermachen."
          />
          <ol className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/10 font-mono text-xs font-semibold text-violet-200">
                  {index + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="anforderungen-heading">
          <SectionHeading
            id="anforderungen-heading"
            eyebrow="Anforderungen"
            title="Das braucht dein Plugin"
            description="Diese Angaben prüfen wir vor der Veröffentlichung."
          />
          <ul className="grid gap-4 sm:grid-cols-2">
            {REQUIREMENTS.map((requirement) => (
              <li
                key={requirement.title}
                className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
              >
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <div>
                  <h3 className="text-sm font-semibold text-white">{requirement.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{requirement.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="hinweise-heading"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6"
        >
          <h2 id="hinweise-heading" className="text-lg font-semibold text-white">
            Vor der Einreichung
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Für eingereichte Inhalte gelten die{' '}
            <Link
              href="/nutzungsbedingungen"
              className="text-zinc-200 underline-offset-4 hover:text-white hover:underline"
            >
              {TERMS_LABEL}
            </Link>
            . Dort stehen auch das Meldeverfahren und der Weg zum Widerspruch, falls ein Eintrag
            beanstandet wird.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/developer" size="sm">
              Zum Entwicklerbereich <ArrowRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
            <ButtonLink href="/plugins" variant="secondary" size="sm">
              Plugin-Katalog ansehen
            </ButtonLink>
            <ButtonLink
              href={PRODUCT_PLUGIN_SDK_URL}
              variant="ghost"
              size="sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              Plugin-SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </section>
      </Container>
    </>
  );
}
