import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import {
  ArrowRightIcon,
  BookIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitHubIcon,
  PlugIcon,
} from '@/components/ui/icons';
import {
  PRODUCT_DISCUSSIONS_URL,
  PRODUCT_DOCS_URL,
  PRODUCT_ISSUES_URL,
  PRODUCT_LATEST_RELEASE_URL,
  PRODUCT_PLUGIN_SDK_URL,
  PRODUCT_REPOSITORY_URL,
  PRODUCT_THEME_SDK_URL,
  absoluteUrl,
} from '@/lib/site';
import { defaultSocialImages } from '@/lib/metadata';

export const metadata: Metadata = {
  title: 'Über das Projekt',
  description:
    'Was WebRadio kann, wie du es unter Windows und Linux installierst und wie Plugins und Themes funktionieren.',
  openGraph: {
    title: 'Über das Projekt · WebRadio',
    description:
      'Was WebRadio kann, wie du es unter Windows und Linux installierst und wie Plugins und Themes funktionieren.',
    images: defaultSocialImages(),
    ...(absoluteUrl('/docs') ? { url: absoluteUrl('/docs') } : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Über das Projekt · WebRadio',
    description:
      'Was WebRadio kann, wie du es unter Windows und Linux installierst und wie Plugins und Themes funktionieren.',
  },
  ...(absoluteUrl('/docs') ? { alternates: { canonical: absoluteUrl('/docs') } } : {}),
};

const NAV_SECTIONS = [
  { id: 'funktionen', label: 'Funktionen' },
  { id: 'installation', label: 'Installation' },
  { id: 'erweiterungen', label: 'Plugins & Themes' },
  { id: 'faq', label: 'Häufige Fragen' },
  { id: 'mitmachen', label: 'Mitmachen' },
] as const;

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">
      {children}
    </code>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.07] pt-10 first:border-0 first:pt-0">
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

const FAQ = [
  {
    question: 'Ist WebRadio kostenlos?',
    answer:
      'Ja. WebRadio steht unter der Apache-Lizenz 2.0 und ist für Windows und Linux kostenlos nutzbar.',
  },
  {
    question: 'Auf welchen Systemen läuft WebRadio?',
    answer:
      'Windows und Linux. Für macOS gibt es derzeit keine Version.',
  },
  {
    question: 'Muss ich etwas installieren, damit Plugins funktionieren?',
    answer:
      'Nein. Plugins und Themes sind Erweiterungen für das Programm; zusätzliche Software musst du dafür nicht installieren. Ein Plugin entpackst du in den Erweiterungsordner, ein Theme wählst du im Programm aus.',
  },
  {
    question: 'Warum startet das AppImage unter Linux nicht?',
    answer:
      'Meist fehlt die Bibliothek libfuse2. Installiere sie über die Paketverwaltung deiner Distribution und starte die Datei erneut.',
  },
  {
    question: 'Wo finde ich ältere Versionen?',
    answer:
      'Alle veröffentlichten Versionen stehen auf der Release-Seite; ältere Builds sind dort eingeklappt.',
  },
  {
    question: 'Wie melde ich ein Problem?',
    answer:
      'Am schnellsten über die Fehlermeldung im Projekt. Bitte nenne Version, Betriebssystem und was du zuletzt getan hast.',
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Über das Projekt"
        title="WebRadio: Radio hören, ohne Umwege"
        description="Ein quelloffener Internetradio-Player für Windows und Linux – mit weltweiter Sendersuche, eigener Audiopipeline und Erweiterungen aus der Community."
        actions={
          <>
            <ButtonLink href={PRODUCT_LATEST_RELEASE_URL} target="_blank" rel="noopener noreferrer">
              <DownloadIcon className="h-4 w-4" /> Herunterladen
            </ButtonLink>
            <ButtonLink href="/releases" variant="secondary">
              Alle Versionen <ArrowRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </>
        }
      />

      <Container className="py-10">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav
              aria-label="Inhaltsverzeichnis"
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
            >
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Auf dieser Seite
              </p>
              <ul className="space-y-1.5">
                {NAV_SECTIONS.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="max-w-3xl space-y-10">
            <Section id="funktionen" title="Funktionen">
              <p>
                WebRadio verbindet die Suche nach Sendern aus aller Welt mit Favoriten, einer
                eigenen Audiopipeline und einer Oberfläche, die sich anpassen lässt.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Weltweite Sendersuche mit Filtern nach Land, Sprache und Genre.</li>
                <li>Favoriten und zuletzt gehörte Sender, lokal gespeichert.</li>
                <li>Stabile Wiedergabe über eine native Audiopipeline.</li>
                <li>Plugins für zusätzliche Funktionen, Themes für das Aussehen.</li>
                <li>Automatische Updates über die Release-Seite des Projekts.</li>
              </ul>
            </Section>

            <Section id="installation" title="Installation">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <h3 className="text-sm font-semibold text-zinc-100">Windows</h3>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-400">
                    <li>
                      Die Datei mit der Endung <Code>.exe</Code> aus den Downloads laden.
                    </li>
                    <li> Die Datei öffnen und dem Installationsprogramm folgen.</li>
                    <li>WebRadio über das Startmenü starten.</li>
                  </ol>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <h3 className="text-sm font-semibold text-zinc-100">Linux</h3>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-400">
                    <li>
                      Die Datei mit der Endung <Code>.AppImage</Code> laden.
                    </li>
                    <li>
                      Ausführbar machen: <Code>chmod +x WebRadio-*.AppImage</Code>
                    </li>
                    <li>
                      Starten: <Code>./WebRadio-*.AppImage</Code>
                    </li>
                  </ol>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Fehlt <Code>libfuse2</Code>, startet das AppImage nicht. Die Bibliothek lässt
                    sich über die Paketverwaltung der Distribution nachinstallieren.
                  </p>
                </div>
              </div>
              <p>
                Für Arch Linux steht ein Paket im Format <Code>.pkg.tar.zst</Code> bereit, für
                Debian und Ubuntu ein <Code>.deb</Code>-Paket, sofern es im jeweiligen Release
                enthalten ist.
              </p>
              <p>
                Automatische Updates gelten für die Windows-Version und das AppImage. Das
                Arch-Paket und das <Code>.deb</Code>-Paket aktualisierst du über die
                Paketverwaltung deiner Distribution.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/releases" variant="secondary" size="sm">
                  <DownloadIcon className="h-4 w-4" /> Downloads
                </ButtonLink>
                <ButtonLink href={PRODUCT_DOCS_URL} variant="ghost" size="sm">
                  Offizielle Dokumentation <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </Section>

            <Section id="erweiterungen" title="Plugins & Themes">
              <p>
                Erweiterungen liegen jeweils in einem eigenen Ordner. Ein Plugin besteht aus einer
                Beschreibungsdatei <Code>manifest.json</Code> und einer Einstiegsdatei; ein Theme
                bringt seine Gestaltung mit.
              </p>
              <div className="rounded-xl border border-white/[0.08] bg-[#0b0b10] p-4 font-mono text-xs leading-6 text-zinc-300">
                plugins/
                <br />
                └── MeinPlugin/
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;├── manifest.json
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;└── index.js
              </div>
              <p>
                Den vollständigen Ordnerpfad zeigt das Programm an; er unterscheidet sich zwischen
                Windows und Linux. Installiere ein Plugin, indem du den entpackten Ordner dorthin
                legst, und starte das Programm neu.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_PLUGIN_SDK_URL} variant="secondary" size="sm">
                  <PlugIcon className="h-4 w-4" /> Plugin SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_THEME_SDK_URL} variant="ghost" size="sm">
                  Theme SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href="/plugins" variant="ghost" size="sm">
                  Plugin-Katalog <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href="/themes" variant="ghost" size="sm">
                  Theme-Katalog <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </Section>

            <Section id="faq" title="Häufige Fragen">
              <dl className="space-y-3">
                {FAQ.map((entry) => (
                  <div key={entry.question} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <dt className="text-sm font-semibold text-zinc-200">{entry.question}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-zinc-400">{entry.answer}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="mitmachen" title="Mitmachen">
              <p>
                WebRadio ist ein offenes Projekt. Fehlermeldungen, Ideen und Beiträge sind
                willkommen – am besten direkt im Projekt.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_REPOSITORY_URL} variant="secondary" size="sm">
                  <GitHubIcon className="h-4 w-4" /> Projektseite <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_ISSUES_URL} variant="ghost" size="sm">
                  Fehler melden <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_DISCUSSIONS_URL} variant="ghost" size="sm">
                  Austausch <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href="/plugin-einreichen" variant="ghost" size="sm">
                  Eigenes Plugin einreichen <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
              <p className="text-xs text-zinc-500">
                Für Erweiterungen gelten die <Link href="/nutzungsbedingungen" className="text-zinc-400 underline-offset-4 hover:text-white hover:underline">Nutzungsbedingungen</Link>;
                Angaben zum Anbieter stehen im <Link href="/impressum" className="text-zinc-400 underline-offset-4 hover:text-white hover:underline">Impressum</Link>.
              </p>
            </Section>

            <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-500">
              <BookIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <p>
                Diese Seite beschreibt das Programm für Besucher. Technische Unterlagen für die
                Entwicklung stehen in der offiziellen Dokumentation.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
