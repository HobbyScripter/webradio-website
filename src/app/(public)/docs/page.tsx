import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';
import {
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  CodeIcon,
  ExternalLinkIcon,
  GitHubIcon,
  ShieldIcon,
} from '@/components/ui/icons';
import {
  REPOSITORY_DOCS_URL,
  REPOSITORY_ISSUES_URL,
  REPOSITORY_URL,
  absoluteUrl,
} from '@/lib/site';

export const metadata: Metadata = {
  title: 'Dokumentation & Projekt',
  description:
    'Projektinformationen zu WebRadio: Architektur, Installation, öffentliche API, Sicherheitsmodell, bekannte Einschränkungen und Mitarbeit.',
  ...(absoluteUrl('/docs') ? { alternates: { canonical: absoluteUrl('/docs') } } : {}),
};

const NAV_SECTIONS = [
  { id: 'ueberblick', label: 'Überblick' },
  { id: 'funktionen', label: 'Funktionen & Stand' },
  { id: 'technik', label: 'Technik' },
  { id: 'installation', label: 'Installation' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'themes', label: 'Themes' },
  { id: 'entwickler', label: 'Entwickler' },
  { id: 'api', label: 'Öffentliche API' },
  { id: 'sicherheit', label: 'Sicherheit' },
  { id: 'einschraenkungen', label: 'Einschränkungen' },
  { id: 'beitragen', label: 'Mitarbeit' },
  { id: 'weiterfuehrend', label: 'Weiterführende Dokumente' },
] as const;

const STATUS = [
  { area: 'Öffentlicher Plugin- und Theme-Katalog', status: 'Umgesetzt', tone: 'success' as const },
  { area: 'Suche, Sortierung und Pagination', status: 'Umgesetzt', tone: 'success' as const },
  { area: 'Entwickler- und Adminbereich mit RBAC', status: 'Umgesetzt', tone: 'success' as const },
  { area: 'Datenbankgestützte Sessions und Audit-Log', status: 'Umgesetzt', tone: 'success' as const },
  { area: 'Release-Übersicht aus PostgreSQL', status: 'Umgesetzt', tone: 'success' as const },
  { area: 'Radio-Wiedergabe im Browser', status: 'Nicht implementiert', tone: 'warning' as const },
  { area: 'Installation von Plugins/Themes im Client', status: 'Nicht implementiert', tone: 'warning' as const },
  { area: 'Einreichungs-Workflow im Entwicklerportal', status: 'Nicht implementiert', tone: 'warning' as const },
  { area: 'Rate-Limiting und Passwort-Reset', status: 'Offen', tone: 'warning' as const },
];

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/plugins',
    description: 'Freigegebene Plugins mit Suche, Sortierung und Pagination.',
    params: 'q (max. 80 Zeichen), sort=newest|name|downloads, page=1…500',
  },
  {
    method: 'GET',
    path: '/api/themes',
    description: 'Freigegebene Themes mit denselben Filtern.',
    params: 'q, sort, page',
  },
  {
    method: 'GET',
    path: '/api/releases',
    description: 'Alle Release-Einträge, neueste zuerst.',
    params: 'keine',
  },
  {
    method: 'GET',
    path: '/api/news',
    description: 'Veröffentlichte und bereits datierte Neuigkeiten.',
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
    <section id={id} className="scroll-mt-24 border-t border-white/[0.07] pt-10 first:border-0 first:pt-0">
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
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
            Projektinformationen zu WebRadio
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
            Diese Seite fasst Architektur, Installation, öffentliche Schnittstellen und den
            tatsächlichen Funktionsstand zusammen. Die Markdown-Dokumente im Repository bleiben die
            maßgebliche Quelle.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={REPOSITORY_DOCS_URL} variant="secondary" size="sm">
              <GitHubIcon className="h-4 w-4" /> docs/ im Repository
            </ButtonLink>
            <ButtonLink href="/releases" variant="ghost" size="sm">
              Releases <ArrowRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </Container>
      </div>

      <Container className="py-10">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Inhaltsverzeichnis" className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
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
                WebRadio ist ein Open-Source-Projekt für ein erweiterbares Webradio-Ökosystem. Diese
                Website ist der öffentliche Einstieg: Sie stellt das Projekt vor, veröffentlicht
                freigegebene Plugins und Themes und dokumentiert Releases.
              </p>
              <p>
                Das Projekt befindet sich in einer frühen Entwicklungsphase. Die Website, das
                Datenmodell und die Authentifizierung sind implementiert; der eigentliche
                Radio-Client und die Installation von Erweiterungen sind noch nicht Teil dieses
                Repositorys.
              </p>
              <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.05] p-4 text-xs leading-relaxed text-amber-200/90">
                <p className="flex gap-2">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Es gibt derzeit keine veröffentlichte Produktionsdatenbank und keinen initialen
                    ADMIN. Die lokale PostgreSQL-Instanz ist ausschließlich für die Entwicklung
                    vorgesehen.
                  </span>
                </p>
              </div>
            </Section>

            <Section id="funktionen" title="Funktionen & Stand">
              <p>
                Die folgende Übersicht unterscheidet zwischen implementierten Funktionen und
                Punkten, die noch offen sind. Ein grüner Status bedeutet, dass die Funktion im
                Repository implementiert und durch Tests abgedeckt ist.
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

            <Section id="technik" title="Technik">
              <p>
                Die Anwendung nutzt den Next.js App Router (Version 16) mit React 19 und TypeScript.
                Das Styling basiert auf Tailwind CSS 4. Daten werden über Prisma 8 (Release
                Candidate) mit einem contract-basierten Schema in PostgreSQL gespeichert.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-zinc-200">Datenzugriff:</strong> serverseitige
                  Route Handler und Server Components; keine direkten Datenbankzugriffe aus dem
                  Browser.
                </li>
                <li>
                  <strong className="text-zinc-200">Authentifizierung:</strong> NextAuth.js 4 mit
                  Credentials-Provider; die eigentliche Session liegt in PostgreSQL.
                </li>
                <li>
                  <strong className="text-zinc-200">Validierung:</strong> Zod-Schemata für
                  Registrierung, Rollenänderungen und Katalog-Parameter.
                </li>
                <li>
                  <strong className="text-zinc-200">Berechtigungen:</strong> Rollen USER, DEVELOPER
                  und ADMIN; Prüfung bei jedem geschützten Zugriff gegen die Datenbank.
                </li>
              </ul>
              <p>
                Da Prisma 8 noch ein Release Candidate ist, können sich CLI und API zwischen
                Versionen ändern. Die eingesetzten Versionen sind im{' '}
                <Code>package.json</Code> festgeschrieben.
              </p>
            </Section>

            <Section id="installation" title="Installation">
              <p>
                Voraussetzungen: Node.js 22 oder neuer, npm und eine eigene PostgreSQL-Datenbank.
                Verwende niemals die Datenbank eines bestehenden oder alten WebRadio-Projekts.
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0b0b10] p-4 font-mono text-xs leading-6 text-zinc-300">
{`git clone ${REPOSITORY_URL}.git
cd webradio-website
npm install
cp .env.example .env
# DATABASE_URL, TEST_DATABASE_URL und NEXTAUTH_SECRET eintragen

npm run prisma:contract:emit
npm run db:migrate
npm run db:verify
npm run dev`}
              </pre>
              <p>
                Prisma 8 verwendet kein <Code>prisma migrate deploy</Code>. Der dokumentierte
                Ablauf ist <Code>contract emit</Code> → <Code>db migrate</Code> →{' '}
                <Code>db verify</Code>. Weitere Befehle stehen im README.
              </p>
              <p>
                Für einen späteren Produktivbetrieb müssen <Code>DATABASE_URL</Code>,{' '}
                <Code>NEXTAUTH_SECRET</Code> und <Code>NEXTAUTH_URL</Code> als Server-Umgebungsvariablen
                gesetzt werden. Optional kann <Code>NEXT_PUBLIC_SITE_URL</Code> eine öffentliche
                Basis-URL für Canonical-URLs, Open Graph und die Sitemap liefern.
              </p>
            </Section>

            <Section id="plugins" title="Plugins">
              <p>
                Ein Plugin gehört zu einem Entwicklerprofil und besitzt Versionen, Screenshots und
                Tags. Öffentlich sichtbar ist ein Plugin nur, wenn sowohl{' '}
                <Code>isPublished = true</Code> als auch <Code>status = APPROVED</Code> gesetzt ist.
                Diese Bedingung wird in jeder öffentlichen Abfrage serverseitig angewendet.
              </p>
              <p>
                Der Katalog unterstützt Suche über Name und Beschreibung, Sortierung nach
                Aktualität, Name oder Downloads sowie Pagination mit neun Einträgen pro Seite.
                Detailseiten zeigen ausschließlich hinterlegte Versionen und validierte
                HTTP(S)-Download-Links.
              </p>
              <p>
                Ein Formular zur Einreichung neuer Plugins existiert noch nicht. Bis dahin werden
                Einträge nicht über die öffentliche Website angelegt. Private Entwürfe und
                abgelehnte Einträge sind über keine öffentliche API erreichbar.
              </p>
            </Section>

            <Section id="themes" title="Themes">
              <p>
                Themes folgen demselben Veröffentlichungsmodell wie Plugins: Entwicklerprofil,
                Versionen, Screenshots, Tags und die Kombination aus Veröffentlichungsflag und
                Freigabestatus. Vorschaubilder werden nur eingebunden, wenn die gespeicherte URL
                eine absolute HTTP(S)-URL ohne eingebettete Zugangsdaten ist.
              </p>
              <p>
                Das Anwenden eines Themes im Radio-Client ist noch nicht implementiert. Die
                Website zeigt daher nur Katalogdaten und keine erfundenen Vorschauen.
              </p>
            </Section>

            <Section id="entwickler" title="Entwickler">
              <p>
                Der Entwicklerbereich unter <Link href="/developer" className="text-violet-300 underline-offset-4 hover:underline">/developer</Link>{' '}
                erfordert eine gültige Datenbank-Session mit der Rolle DEVELOPER oder ADMIN. Die
                Rolle wird bei jedem Zugriff aus PostgreSQL gelesen, nicht aus dem Cookie oder
                einem Client-Feld.
              </p>
              <p>
                Der erste Administrator wird ausschließlich über ein CLI-Skript angelegt
                (<Code>npm run admin:bootstrap</Code>). Es verlangt eine explizite Bestätigung,
                verweigert die Ausführung, sobald bereits ein ADMIN existiert, und schreibt einen
                Audit-Eintrag. Ein festes Standardpasswort oder eine Selbstbeförderung über die
                Registrierung existiert nicht.
              </p>
            </Section>

            <Section id="api" title="Öffentliche API">
              <p>
                Die öffentlichen Endpunkte liefern ausschließlich freigegebene Daten. Sie geben
                keine E-Mail-Adressen, Session-Tokens, Audit-Logs oder privaten Entwürfe zurück.
                Fehlerantworten enthalten keine internen Details.
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                  <thead className="bg-white/[0.03] text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Endpunkt</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Beschreibung</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Parameter</th>
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
                <Code>{'{ data: [...], pagination: { page, pageSize, hasNext } }'}</Code>. Bei
                ungültigen Parametern antwortet die API mit <Code>400</Code>, bei serverseitigen
                Fehlern mit einer generischen <Code>500</Code>-Meldung. Die Antworten dürfen für
                kurze Zeit öffentlich zwischengespeichert werden.
              </p>
            </Section>

            <Section id="sicherheit" title="Sicherheit">
              <p className="flex gap-2">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <span>
                  Passwörter werden mit bcrypt gehasht. Session-Tokens entstehen aus 32 zufälligen
                  Bytes und werden in der Datenbank nur als SHA-256-Hash gespeichert. Cookies sind
                  HttpOnly und SameSite=Lax; bei HTTPS erhalten sie das Secure-Flag und das
                  <Code>__Secure-</Code>-Präfix.
                </span>
              </p>
              <p>
                Ablauf und Widerruf werden bei jedem geschützten Zugriff geprüft. Die Middleware
                beziehungsweise der Next-16-Proxy dient nur als optimistischer Cookie-Check und
                ersetzt keine serverseitige Autorisierung.
              </p>
              <p>
                <strong className="text-amber-200">Noch offen:</strong> Rate-Limiting für Login und
                Registrierung sowie ein Passwort-Reset-Verfahren sind nicht implementiert. Es gibt
                keine Zwei-Faktor-Authentifizierung und keine E-Mail-Verifizierung.
              </p>
            </Section>

            <Section id="einschraenkungen" title="Bekannte Einschränkungen">
              <ul className="list-disc space-y-2 pl-5">
                <li>Prisma 8 ist ein Release Candidate; Werkzeuge und APIs können sich ändern.</li>
                <li>Rate-Limiting, Passwort-Reset und E-Mail-Verifizierung fehlen.</li>
                <li>Die Integrationstests sind noch nicht in CI eingebunden.</li>
                <li>Die lokale PostgreSQL-Instanz ist keine Produktionsdatenbank.</li>
                <li>Es existiert noch kein initialer ADMIN; ältere JWTs können ungültig sein.</li>
                <li>Ein Web-Player, Plugin-Installation und Theme-Anwendung fehlen.</li>
                <li>Das Release-Modell enthält keine Plattformangaben.</li>
                <li>Datenschutzerklärung und Impressum sind noch nicht veröffentlicht.</li>
                <li>Eine Lizenzdatei ist im Repository derzeit nicht vorhanden.</li>
              </ul>
            </Section>

            <Section id="beitragen" title="Mitarbeit">
              <p>
                Der Quellcode ist auf GitHub öffentlich. Fehlerberichte und Vorschläge gehören in
                die Issues des Repositories. Größere Änderungen sollten vor der Umsetzung
                abgestimmt werden, damit sie zur bestehenden Architektur und den Sicherheitsregeln
                passen.
              </p>
              <p>
                Beiträge müssen die vorhandenen Tests erhalten. Sicherheitsprüfungen und
                Berechtigungsregeln dürfen nicht abgeschwächt werden. Für Änderungen am
                Datenmodell ist der dokumentierte Contract- und Migrationsablauf zu verwenden.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={REPOSITORY_ISSUES_URL} variant="secondary" size="sm">
                  Issues öffnen
                </ButtonLink>
                <ButtonLink href={REPOSITORY_URL} variant="ghost" size="sm">
                  <GitHubIcon className="h-4 w-4" /> Repository
                </ButtonLink>
              </div>
            </Section>

            <Section id="weiterfuehrend" title="Weiterführende Dokumente">
              <ul className="space-y-2">
                {[
                  ['README', 'Installation, Befehle und Projektstruktur', `${REPOSITORY_URL}/blob/master/README.md`],
                  ['Architektur', 'Technische Entscheidungen und Datenmodell', `${REPOSITORY_URL}/blob/master/docs/ARCHITECTURE.md`],
                  ['Sicherheit', 'Authentifizierung, Sessions und Bedrohungsmodell', `${REPOSITORY_URL}/blob/master/docs/SECURITY.md`],
                  ['Testing', 'Teststrategie und Integrationstests', `${REPOSITORY_URL}/blob/master/docs/TESTING.md`],
                  ['Phase 3.5', 'Datenbankintegration und Sessionmodell', `${REPOSITORY_URL}/blob/master/docs/PHASE3_5_REPORT.md`],
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
                <CodeIcon className="h-3.5 w-3.5" /> Externe Dokumente öffnen auf GitHub in einem
                neuen Tab.
              </p>
            </Section>
          </div>
        </div>
      </Container>
    </>
  );
}
