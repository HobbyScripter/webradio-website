import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';
import {
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  CodeIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitHubIcon,
  ShieldIcon,
} from '@/components/ui/icons';
import { getReadme } from '@/lib/github';
import { formatDateTime } from '@/lib/format';
import {
  PRODUCT_API_REFERENCE_URL,
  PRODUCT_ARCHITECTURE_URL,
  PRODUCT_CODE_OF_CONDUCT_URL,
  PRODUCT_CONTRIBUTING_URL,
  PRODUCT_DISCUSSIONS_URL,
  PRODUCT_DOCS_URL,
  PRODUCT_ISSUES_URL,
  PRODUCT_LATEST_RELEASE_URL,
  PRODUCT_LICENSE_URL,
  PRODUCT_PLUGIN_SDK_URL,
  PRODUCT_PRIVACY_URL,
  PRODUCT_RELEASES_URL,
  PRODUCT_REPOSITORY_URL,
  PRODUCT_SECURITY_URL,
  PRODUCT_THEME_SDK_URL,
  WEBSITE_REPOSITORY_URL,
  absoluteUrl,
} from '@/lib/site';

export const metadata: Metadata = {
  title: 'Dokumentation & Projekt',
  description:
    'Projektinformationen zu WebRadio: Funktionen, Downloads für Windows und Linux, Plugin- und Theme-System, öffentliche Website-API, Sicherheitsmodell und bekannte Einschränkungen.',
  ...(absoluteUrl('/docs') ? { alternates: { canonical: absoluteUrl('/docs') } } : {}),
};

const NAV_SECTIONS = [
  { id: 'ueberblick', label: 'Überblick' },
  { id: 'funktionen', label: 'Funktionen & Stand' },
  { id: 'downloads', label: 'Downloads & Installation' },
  { id: 'technik', label: 'Technik' },
  { id: 'erweiterungen', label: 'Plugins & Themes' },
  { id: 'website-katalog', label: 'Website-Katalog' },
  { id: 'api', label: 'Website-API' },
  { id: 'sicherheit', label: 'Sicherheit' },
  { id: 'einschraenkungen', label: 'Einschränkungen' },
  { id: 'mitmachen', label: 'Mitmachen' },
  { id: 'dokumente', label: 'Offizielle Dokumente' },
] as const;

const STATUS: { area: string; status: string; tone: BadgeTone }[] = [
  { area: 'Desktop-App für Windows und Linux', status: 'Veröffentlicht', tone: 'success' },
  { area: 'Weltweite Sendersuche (Radio Browser API)', status: 'Im Programm', tone: 'success' },
  { area: 'FFmpeg- + AudioWorklet-Audiopipeline', status: 'Im Programm', tone: 'success' },
  { area: 'Plugin-System mit Capabilities', status: 'Im Programm', tone: 'success' },
  { area: 'Theme-System und Theme-Pakete', status: 'Im Programm', tone: 'success' },
  {
    area: 'Website-Katalog für Plugins und Themes',
    status: 'Implementiert, nur freigegebene Einträge',
    tone: 'accent',
  },
  { area: 'Rollen, datenbankgestützte Sessions, Audit-Log', status: 'Implementiert', tone: 'success' },
  { area: 'Rate-Limiting, Passwort-Reset, E-Mail-Verifizierung', status: 'Implementiert', tone: 'success' },
  {
    area: 'GitHub-Release-Daten und Downloads',
    status: 'Live aus GitHub',
    tone: 'accent',
  },
  {
    area: 'CI mit PostgreSQL-Integrationstests',
    status: 'Vorhanden, extern unbestätigt',
    tone: 'warning',
  },
  { area: 'macOS-Build', status: 'Nicht verfügbar', tone: 'warning' },
  {
    area: 'Produktiver E-Mail-Versand (SMTP)',
    status: 'Nicht konfiguriert',
    tone: 'warning',
  },
  {
    area: 'Datenschutz und Impressum dieser Website',
    status: 'Offen',
    tone: 'warning',
  },
];

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/releases',
    description:
      'Öffentliche GitHub-Releases mit tagName, Kanal, Release Notes und validierten Assets.',
    params: 'keine',
  },
  {
    method: 'GET',
    path: '/api/plugins',
    description: 'Freigegebene WebRadio-Plugins aus der Website-Datenbank.',
    params: 'q (max. 80 Zeichen), sort=newest|name|downloads, page=1…500',
  },
  {
    method: 'GET',
    path: '/api/themes',
    description: 'Freigegebene WebRadio-Themes aus der Website-Datenbank.',
    params: 'q, sort, page',
  },
  {
    method: 'GET',
    path: '/api/news',
    description: 'Veröffentlichte und bereits datierte Website-Neuigkeiten.',
    params: 'keine',
  },
  {
    method: 'GET',
    path: '/api/health',
    description: 'Einfacher Health-Check ohne vertrauliche Daten.',
    params: 'keine',
  },
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
    <section
      id={id}
      className="scroll-mt-24 border-t border-white/[0.07] pt-10 first:border-0 first:pt-0"
    >
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

async function ReadmeExcerpt() {
  await io();
  const readme = await getReadme();

  if (!readme) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-zinc-400">
        Das offizielle README ist momentan nicht abrufbar. Der Inhalt dieser Seite bleibt davon
        unabhängig nutzbar; die aktuelle Fassung steht im{' '}
        <a
          href={PRODUCT_REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-300 underline-offset-4 hover:underline"
        >
          GitHub-Repository
        </a>
        .
      </div>
    );
  }

  const updated = formatDateTime(readme.fetchedAt);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
        {readme.excerpt}
      </p>
      <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-zinc-500">
        Gekürzter Text aus dem offiziellen README
        {updated ? `, geladen am ${updated}` : ''}.{' '}
        <a
          href={readme.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 underline-offset-4 hover:text-white hover:underline"
        >
          Original öffnen
        </a>
        .
      </p>
    </div>
  );
}

export default function DocsPage() {
  return (
    <>
      <div className="border-b border-white/[0.07] bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.10),transparent_55%)]">
        <Container className="py-12 sm:py-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
            Dokumentation
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            WebRadio: Projekt, Downloads und Erweiterungen
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
            Diese Seite fasst das Desktop-Programm, die offiziellen Downloads, das Plugin- und
            Theme-System sowie die öffentliche Website zusammen. Für Entwicklung und SDK-Details
            bleibt die offizielle Dokumentation maßgeblich.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={PRODUCT_DOCS_URL} variant="secondary" size="sm">
              <BookIcon className="h-4 w-4" /> Offizielle Docs
              <ExternalLinkIcon className="h-3 w-3" />
            </ButtonLink>
            <ButtonLink href="/releases" variant="ghost" size="sm">
              <DownloadIcon className="h-4 w-4" /> Downloads
            </ButtonLink>
            <ButtonLink href={PRODUCT_REPOSITORY_URL} variant="ghost" size="sm">
              <GitHubIcon className="h-4 w-4" /> Repository
            </ButtonLink>
          </div>
        </Container>
      </div>

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
            <Section id="ueberblick" title="Überblick">
              <p>
                WebRadio ist ein quelloffener Internetradio-Player für den Desktop. Die Anwendung
                verbindet die Suche nach Sendern aus aller Welt mit Favoriten, einer eigenen
                Audiopipeline und einer erweiterbaren Oberfläche. Sie ist für Windows und Linux
                verfügbar; macOS ist derzeit nicht verfügbar.
              </p>
              <p>
                Dieses Repository ist die <strong className="text-zinc-200">Website</strong> zum
                Projekt. Sie stellt das Programm vor, veröffentlicht freigegebene Plugins und
                Themes aus der Website-Datenbank und zeigt offizielle Releases direkt aus dem
                GitHub-Repository. Die Desktop-Anwendung selbst liegt unter{' '}
                <a
                  href={PRODUCT_REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 underline-offset-4 hover:underline"
                >
                  YourEliteSystems/WebRadio
                </a>
                .
              </p>
              <Suspense
                fallback={
                  <div
                    className="h-32 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]"
                    aria-hidden="true"
                  />
                }
              >
                <ReadmeExcerpt />
              </Suspense>
              <p className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.05] p-4 text-xs leading-relaxed text-emerald-100/90">
                Lizenz: WebRadio steht unter der Apache License 2.0. Eingebundene Bibliotheken und
                mitgelieferte Programme können abweichende Bedingungen haben; die
                Drittanbieter-Hinweise im Repository sind dafür die Referenz.
              </p>
            </Section>

            <Section id="funktionen" title="Funktionen & Stand">
              <p>
                Die Übersicht unterscheidet zwischen Funktionen des Desktop-Programms und
                Fähigkeiten dieser Website. Ein Status „Im Programm“ bedeutet, dass die Funktion
                zur veröffentlichten Anwendung gehört – nicht, dass sie auf dieser Website
                ausgeführt wird.
              </p>
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08]">
                {STATUS.map((row) => (
                  <li
                    key={row.area}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-zinc-300">{row.area}</span>
                    <Badge tone={row.tone}>{row.status}</Badge>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="downloads" title="Downloads & Installation">
              <p>
                Offizielle Downloads stehen ausschließlich in den{' '}
                <a
                  href={PRODUCT_RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 underline-offset-4 hover:underline"
                >
                  GitHub-Releases
                </a>{' '}
                bereit. Die Website liest Versionen, Dateinamen, Größen und SHA-256-Digests direkt
                aus denselben Release-Daten und konstruiert keine Download-URLs.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-zinc-200">Windows x64:</strong> Installer (EXE), sofern im
                  jeweiligen Release angehängt.
                </li>
                <li>
                  <strong className="text-zinc-200">Linux x86_64:</strong> AppImage; auf dem
                  Zielsystem sind dafür kein Node.js, npm, Electron oder FFmpeg erforderlich.
                </li>
                <li>
                  <strong className="text-zinc-200">Arch Linux:</strong> Paket im Format{' '}
                  <Code>.pkg.tar.zst</Code>.
                </li>
                <li>
                  <strong className="text-zinc-200">Debian/Ubuntu:</strong> Ein{' '}
                  <Code>.deb</Code>-Build-Skript existiert, das Paket ist aber nicht in jedem
                  Release enthalten.
                </li>
                <li>
                  <strong className="text-zinc-200">macOS:</strong> derzeit nicht verfügbar.
                </li>
              </ul>
              <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0b0b10] p-4 font-mono text-xs leading-6 text-zinc-300">
{`# AppImage
chmod +x WebRadio-*-linux-x86_64.AppImage
./WebRadio-*-linux-x86_64.AppImage

# Arch Linux
sudo pacman -U webradio-*-x86_64.pkg.tar.zst`}
              </pre>
              <p className="text-xs text-zinc-500">
                Befehle aus dem offiziellen README. Maßgeblich sind immer die Dateien des
                tatsächlich veröffentlichten Releases.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_LATEST_RELEASE_URL} variant="secondary" size="sm">
                  Neuestes Release <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href="/releases" variant="ghost" size="sm">
                  Auf dieser Website <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </Section>

            <Section id="technik" title="Technik">
              <p>
                Das Desktop-Programm basiert auf Electron und React 19. Der Renderer wird mit
                esbuild gebaut, die Paketierung erfolgt über electron-builder. Streams werden über
                FFmpeg verarbeitet und als PCM über eine AudioWorklet-Pipeline wiedergegeben.
                Sender stammen aus der Radio Browser API; Updates laufen über electron-updater.
              </p>
              <p>
                Plugins sind Vanilla JavaScript beziehungsweise ES Modules. Themes basieren auf CSS
                und Theme-Paketen. Beide Erweiterungstypen sind ausdrücklich für WebRadio
                vorgesehen.
              </p>
              <p className="border-t border-white/[0.07] pt-4">
                Diese Website nutzt den Next.js App Router (Version 16) mit React 19, TypeScript,
                Tailwind CSS 4 und PostgreSQL. Der Datenzugriff läuft serverseitig über Prisma 8
                (Release Candidate). Die Website-Datenbank speichert Benutzer, Rollen, Sessions,
                Website-Katalog und Audit-Logs – nicht die offiziellen Releases.
              </p>
            </Section>

            <Section id="erweiterungen" title="Plugins & Themes">
              <p>
                Das Plugin-System von WebRadio unterstützt Manifeste, Permissions, Capabilities,
                Lifecycle-Hooks, Storage, Navigation und UI-Erweiterungen. Plugins können
                Fähigkeiten anfordern, aber nicht selbst gewähren; unbekannte Capabilities werden
                abgelehnt.
              </p>
              <p>
                Themes passen die Oberfläche über CSS-Variablen und Theme-Pakete an. Im Projekt
                vorhanden sind unter anderem <Code>default</Code>, <Code>dark</Code> und{' '}
                <Code>neon</Code>; eigene Theme-Pakete sind möglich.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_PLUGIN_SDK_URL} variant="secondary" size="sm">
                  Plugin SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_THEME_SDK_URL} variant="ghost" size="sm">
                  Theme SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_API_REFERENCE_URL} variant="ghost" size="sm">
                  API Reference <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </Section>

            <Section id="website-katalog" title="Website-Katalog">
              <p>
                Der öffentliche Katalog unter <Link href="/plugins" className="text-violet-300 underline-offset-4 hover:underline">/plugins</Link>{' '}
                und <Link href="/themes" className="text-violet-300 underline-offset-4 hover:underline">/themes</Link>{' '}
                wird von dieser Website verwaltet. Ein Eintrag erscheint nur, wenn er sowohl als
                veröffentlicht markiert als auch freigegeben ist. Entwürfe, ausstehende
                Einreichungen und abgelehnte Einträge sind über keine öffentliche Seite oder API
                erreichbar.
              </p>
              <p>
                Jeder Eintrag ist serverseitig dem Produkt WebRadio zugeordnet. Der Katalog ist
                kein allgemeiner Marktplatz für andere Programme. Solange kein Eintrag freigegeben
                ist, bleibt der jeweilige Katalog leer; es werden keine Beispieldaten erzeugt.
              </p>
            </Section>

            <Section id="api" title="Website-API">
              <p>
                Die öffentlichen Endpunkte liefern ausschließlich freigegebene beziehungsweise
                öffentliche Daten. Sie geben keine E-Mail-Adressen, Session-Tokens, Audit-Logs oder
                privaten Entwürfe zurück. Fehlerantworten enthalten keine internen Details.
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                  <thead className="bg-white/[0.03] text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Endpunkt
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Beschreibung
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Parameter
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {API_ENDPOINTS.map((endpoint) => (
                      <tr key={endpoint.path}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="mr-2 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                            {endpoint.method}
                          </span>
                          <Code>{endpoint.path}</Code>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{endpoint.description}</td>
                        <td className="px-4 py-3 text-zinc-500">{endpoint.params}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Katalogantworten haben die Form{' '}
                <Code>{'{ data: [...], pagination: { page, pageSize, hasNext } }'}</Code>.{' '}
                <Code>/api/releases</Code> liefert zusätzlich <Code>latest</Code>,{' '}
                <Code>repository</Code> und <Code>source</Code> mit GitHub-Herkunft, Datenstand und
                Stale-Kennzeichnung. Bei ungültigen Parametern antwortet die API mit{' '}
                <Code>400</Code>; bei einem GitHub-Ausfall mit <Code>503</Code> statt erfundener
                Releases.
              </p>
              <p>
                Öffentliche Antworten sind <Code>no-store</Code>. Ein zurückgezogener Katalogeintrag
                darf nicht aus einem Shared Cache weitergelebt werden. GitHub-Antworten werden
                serverseitig höchstens fünf Minuten zwischengespeichert; ein veralteter Bestand
                wird nur als Fallback und ausdrücklich gekennzeichnet verwendet.
              </p>
            </Section>

            <Section id="sicherheit" title="Sicherheit">
              <p className="flex gap-2">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <span>
                  Passwörter werden mit bcrypt gehasht. Session-Tokens entstehen aus zufälligen
                  Bytes und werden in der Datenbank nur als Hash gespeichert. Cookies sind
                  HttpOnly und SameSite=Lax; unter HTTPS erhalten sie das Secure-Flag. Rollen
                  werden bei jedem geschützten Zugriff aus PostgreSQL gelesen, nicht aus dem Cookie
                  oder einer Client-Angabe.
                </span>
              </p>
              <p>
                Login, Registrierung, Passwort-Reset und E-Mail-Verifizierung sind rate-limitiert.
                Reset- und Verifizierungs-Tokens sind zeitlich begrenzt, nur einmal verwendbar und
                werden niemals geloggt. Privilegierte Rollenänderungen setzen eine bestätigte
                E-Mail-Adresse voraus und werden auditiert.
              </p>
              <p>
                <strong className="text-amber-200">Noch offen:</strong> Ohne SMTP-Konfiguration
                versendet die Anwendung keine echten E-Mails; im Entwicklungsbetrieb landen sie im
                lokalen Outbox-Verzeichnis. Der erste <Code>SYSTEM_ADMIN</Code> muss über den
                dokumentierten CLI-Weg vom Betreiber angelegt werden. Datenschutzerklärung und
                Impressum dieser Website sind noch nicht veröffentlicht.
              </p>
            </Section>

            <Section id="einschraenkungen" title="Bekannte Einschränkungen">
              <ul className="list-disc space-y-2 pl-5">
                <li>macOS wird derzeit nicht unterstützt; ein Build ist in Vorbereitung.</li>
                <li>
                  Ein <Code>.deb</Code>-Paket ist nicht in jedem Release enthalten. Maßgeblich sind
                  die tatsächlich angehängten Dateien.
                </li>
                <li>
                  Die vollständige transitive Lizenzinventur und die Prüfung der mitgelieferten
                  FFmpeg-Binärdateien sind im Upstream-Projekt noch offen.
                </li>
                <li>
                  Prisma 8 ist ein Release Candidate; Werkzeuge und APIs können sich ändern.
                </li>
                <li>
                  Der GitHub-Zugriff läuft ohne Token gegen das öffentliche API-Limit. Ein
                  serverseitiger Token ist optional und wird nie an den Browser ausgeliefert.
                </li>
                <li>
                  Die Website wurde noch nicht auf Vercel betrieben; CI und CDN-Verhalten sind
                  extern noch nicht bestätigt.
                </li>
                <li>
                  Der Website-Katalog ist unabhängig von den GitHub-Releases und enthält nur
                  Einträge, die tatsächlich freigegeben wurden.
                </li>
              </ul>
            </Section>

            <Section id="mitmachen" title="Mitmachen">
              <p>
                WebRadio ist ein Open-Source-Projekt und lebt von Menschen, die es ausprobieren,
                testen, verbessern und erweitern. Beiträge zum Desktop-Programm folgen den Regeln
                im offiziellen Repository; dazu gehören Contributing-Leitfaden, Code of Conduct und
                die Security Policy.
              </p>
              <p>
                Für diese Website gelten dieselben Grundsätze: bestehende Tests und
                Berechtigungsprüfungen dürfen nicht abgeschwächt werden. Änderungen am
                Datenmodell benötigen den dokumentierten Contract- und Migrationsablauf.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_CONTRIBUTING_URL} variant="secondary" size="sm">
                  Contributing <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_ISSUES_URL} variant="ghost" size="sm">
                  Issues <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_DISCUSSIONS_URL} variant="ghost" size="sm">
                  Discussions <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
                <ButtonLink href={PRODUCT_SECURITY_URL} variant="ghost" size="sm">
                  Security Policy <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
            </Section>

            <Section id="dokumente" title="Offizielle Dokumente">
              <ul className="space-y-2">
                {[
                  ['Offizielle Dokumentation', 'Einstieg, Architektur und Anleitungen', PRODUCT_DOCS_URL],
                  ['Plugin SDK', 'Plugins, Manifeste und Capabilities', PRODUCT_PLUGIN_SDK_URL],
                  ['Theme SDK', 'Themes und Theme-Pakete', PRODUCT_THEME_SDK_URL],
                  ['API Reference', 'Öffentliche APIs des Programms', PRODUCT_API_REFERENCE_URL],
                  ['Architektur', 'Core, Lifecycle und Subsysteme', PRODUCT_ARCHITECTURE_URL],
                  ['Datenschutz des Programms', 'Externe Datenflüsse', PRODUCT_PRIVACY_URL],
                  ['Lizenz', 'Apache License 2.0', PRODUCT_LICENSE_URL],
                  ['Code of Conduct', 'Community-Regeln', PRODUCT_CODE_OF_CONDUCT_URL],
                  ['Website-Quellcode', 'Dieses Next.js-Projekt', WEBSITE_REPOSITORY_URL],
                ].map(([title, description, href]) => (
                  <li key={title}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.14]"
                    >
                      <span>
                        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-200 group-hover:text-white">
                          <BookIcon className="h-4 w-4 text-violet-300" /> {title}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">{description}</span>
                      </span>
                      <ExternalLinkIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <CodeIcon className="h-3.5 w-3.5" /> Externe Dokumente öffnen auf GitHub
                beziehungsweise Read the Docs in einem neuen Tab.
              </p>
            </Section>

            <div className="flex gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] p-4 text-xs leading-relaxed text-amber-200/90">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Diese Website ist kein Ersatz für die offizielle Dokumentation und keine
                Downloadquelle aus zweiter Hand: Release-Daten und Dateien stammen direkt von
                GitHub. Datenschutz und Impressum dieser Website sind noch nicht veröffentlicht.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
