import Link from 'next/link';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container, SectionHeading } from '@/components/ui/layout';
import {
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  CodeIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitHubIcon,
  LayersIcon,
  PaletteIcon,
  PlugIcon,
  RadioIcon,
  ShieldIcon,
} from '@/components/ui/icons';
import { CatalogueSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { listPublishedPlugins, listPublishedThemes, listReleases } from '@/lib/catalog';
import { formatDate, releaseChannelLabel } from '@/lib/format';
import {
  REPOSITORY_DOCS_URL,
  REPOSITORY_ISSUES_URL,
  REPOSITORY_URL,
  safeHttpUrl,
} from '@/lib/site';

const FEATURES = [
  {
    title: 'Radio hören und entdecken',
    description:
      'Der Kern des Projekts ist ein Webradio, das Sender auffindbar macht und Wiedergabe direkt im Browser ermöglicht. Ein öffentlicher Web-Player ist in diesem Stand noch nicht enthalten.',
    status: 'In Entwicklung',
    tone: 'warning' as const,
    icon: RadioIcon,
  },
  {
    title: 'Plugins als Erweiterungspunkte',
    description:
      'Das Datenmodell für Plugins, Versionen, Tags und Freigaben steht. Veröffentlichte und freigegebene Einträge erscheinen im öffentlichen Katalog; die Installation im Client folgt.',
    status: 'Katalog aktiv',
    tone: 'accent' as const,
    icon: PlugIcon,
  },
  {
    title: 'Themes für die Oberfläche',
    description:
      'Themes werden mit Versionen, Vorschaubildern und Tags verwaltet. Öffentlich sichtbar sind ausschließlich freigegebene Einträge – ohne erfundene Vorschauen.',
    status: 'Katalog aktiv',
    tone: 'accent' as const,
    icon: PaletteIcon,
  },
  {
    title: 'Rollen, Sessions und Audit-Log',
    description:
      'Anmeldung und Berechtigungen laufen über datenbankgestützte Sessions. Rollen werden bei jedem Zugriff serverseitig aus PostgreSQL gelesen, administrative Änderungen werden auditiert.',
    status: 'Umgesetzt',
    tone: 'success' as const,
    icon: ShieldIcon,
  },
];

const PLATFORM_POINTS = [
  {
    title: 'Öffentlicher Katalog',
    description: 'Plugins und Themes mit serverseitiger Freigabeprüfung, Suche und Pagination.',
    icon: LayersIcon,
  },
  {
    title: 'Entwicklerbereich',
    description: 'Geschützter Bereich für DEVELOPER und ADMIN mit serverseitiger Rollenprüfung.',
    icon: CodeIcon,
  },
  {
    title: 'Dokumentation',
    description: 'Technische Dokumentation, Sicherheitskonzept und Architektur im Repository.',
    icon: BookIcon,
  },
];

async function CataloguePreview() {
  await io();

  let plugins;
  let themes;

  try {
    [plugins, themes] = await Promise.all([
      listPublishedPlugins({ q: '', sort: 'newest', page: 1, pageSize: 3 }),
      listPublishedThemes({ q: '', sort: 'newest', page: 1, pageSize: 3 }),
    ]);
  } catch {
    return (
      <ErrorState
        title="Katalog-Vorschau nicht verfügbar"
        description="Die Datenbank ist momentan nicht erreichbar. Die vollständigen Kataloge findest du trotzdem über die Navigation."
        retryHref="/plugins"
      />
    );
  }

  if (plugins.items.length === 0 && themes.items.length === 0) {
    return (
      <EmptyState
        title="Noch keine veröffentlichten Einträge"
        description="Sobald Plugins oder Themes freigegeben sind, erscheinen die neuesten Einträge hier. Es werden bewusst keine Beispieldaten angezeigt."
        icon={<PlugIcon className="h-5 w-5" />}
        action={
          <ButtonLink href="/docs#entwickler" variant="secondary" size="sm">
            Einreichung dokumentieren
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <PreviewList
        title="Neueste Plugins"
        href="/plugins"
        emptyText="Noch keine veröffentlichten Plugins."
        items={plugins.items.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.developerName,
          description: item.description,
          tags: item.tags,
          href: `/plugins/${item.slug}`,
        }))}
        icon={<PlugIcon className="h-4 w-4" />}
      />
      <PreviewList
        title="Neueste Themes"
        href="/themes"
        emptyText="Noch keine veröffentlichten Themes."
        items={themes.items.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.developerName,
          description: item.description,
          tags: item.tags,
          href: `/themes/${item.slug}`,
        }))}
        icon={<PaletteIcon className="h-4 w-4" />}
      />
    </div>
  );
}

function PreviewList({
  title,
  href,
  items,
  emptyText,
  icon,
}: {
  title: string;
  href: string;
  emptyText: string;
  icon: React.ReactNode;
  items: {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    tags: string[];
    href: string;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <span className="text-violet-400">{icon}</span>
          {title}
        </h3>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
        >
          Alle ansehen <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="group block py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 group-hover:text-white">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">von {item.subtitle}</p>
                    <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">{item.description}</p>
                  </div>
                  <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400" />
                </div>
                {item.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function ReleasesPreview() {
  await io();

  let releases;
  try {
    releases = await listReleases(3);
  } catch {
    return (
      <ErrorState
        title="Releases nicht verfügbar"
        description="Die Release-Daten konnten nicht geladen werden. Bitte versuche es später erneut."
        retryHref="/releases"
      />
    );
  }

  if (releases.length === 0) {
    return (
      <EmptyState
        title="Noch kein Release veröffentlicht"
        description="Es sind derzeit keine Release-Einträge in der Datenbank hinterlegt. Es werden keine Versionsnummern oder Download-Links erfunden."
        icon={<DownloadIcon className="h-5 w-5" />}
        action={
          <ButtonLink href="/releases" variant="secondary" size="sm">
            Zur Release-Seite
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      {releases.map((release) => {
        const downloadUrl = safeHttpUrl(release.downloadUrl);
        return (
          <article
            key={release.id}
            className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-sm font-semibold text-white">v{release.version}</h3>
                <Badge tone={releaseChannelLabel(release.version) === 'Beta' ? 'beta' : 'success'}>
                  {releaseChannelLabel(release.version)}
                </Badge>
                {release.isLatest ? <Badge tone="accent">Aktuell</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-zinc-400">{release.title}</p>
              {formatDate(release.releaseDate) ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Veröffentlicht am {formatDate(release.releaseDate)}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:text-white"
                >
                  <DownloadIcon className="h-3.5 w-3.5" /> Download
                </a>
              ) : null}
              <Link
                href="/releases"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
              >
                Details <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-white/[0.07]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(124,58,237,0.22),transparent_70%)]" />
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />

        <Container className="relative py-16 sm:py-24 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-3 py-1.5 text-xs font-medium text-violet-200">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />
                Open Source · Aktive Entwicklung
              </div>

              <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Das offene Ökosystem für dein{' '}
                <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                  Webradio
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                WebRadio verbindet Radio-Streaming mit Plugins, Themes und einer
                Entwicklerplattform. Diese Website ist der öffentliche Einstieg in das Projekt –
                mit echten Katalogdaten, dokumentierten Releases und einem geschützten
                Entwicklerbereich.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/releases" size="lg">
                  <DownloadIcon className="h-4 w-4" />
                  Releases ansehen
                </ButtonLink>
                <ButtonLink href="/docs" variant="secondary" size="lg">
                  <BookIcon className="h-4 w-4" />
                  Dokumentation
                </ButtonLink>
              </div>

              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-white/[0.07] pt-6 text-sm">
                <div>
                  <dt className="text-zinc-500">Quellcode</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Öffentlich</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Datenbank</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">PostgreSQL</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Sessions</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Serverseitig</dd>
                </div>
              </dl>
            </div>

            <div className="relative" aria-hidden="true">
              <div className="absolute -inset-6 rounded-[2rem] bg-violet-600/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b10] shadow-2xl shadow-black/60">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Systemübersicht
                  </span>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.07] p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                        <RadioIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">WebRadio Core</p>
                        <p className="text-[11px] text-zinc-400">Öffentliche Website & API</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Plugin-Katalog', value: 'Freigaben', icon: PlugIcon },
                      { label: 'Theme-Katalog', value: 'Versionen', icon: PaletteIcon },
                      { label: 'Entwickler', value: 'Rollen', icon: CodeIcon },
                      { label: 'Audit-Log', value: 'Nachvollziehbar', icon: ShieldIcon },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5"
                      >
                        <row.icon className="h-4 w-4 text-zinc-400" />
                        <p className="mt-2 text-xs font-semibold text-zinc-200">{row.label}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">{row.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/[0.07] p-4">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">PostgreSQL</span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        verbunden
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-violet-500 to-indigo-400" />
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-500">
                      Contract-basiertes Datenmodell
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-white/[0.07] bg-white/[0.015]">
        <Container className="grid gap-6 py-8 sm:grid-cols-3">
          {PLATFORM_POINTS.map((point) => (
            <div key={point.title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-violet-300">
                <point.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-200">{point.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{point.description}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Projektumfang"
            title="Was WebRadio werden soll — und was heute steht"
            description="Wir kennzeichnen den tatsächlichen Stand, statt Funktionen als fertig darzustellen, die noch nicht implementiert sind."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet-300">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <Badge tone={feature.tone}>{feature.status}</Badge>
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-white/[0.07] bg-white/[0.015] py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Katalog"
            title="Veröffentlichte Erweiterungen"
            description="Nur freigegebene und veröffentlichte Einträge erscheinen öffentlich. Die Vorschau wird direkt aus PostgreSQL geladen."
            action={
              <div className="flex gap-2">
                <ButtonLink href="/plugins" variant="secondary" size="sm">
                  Plugins
                </ButtonLink>
                <ButtonLink href="/themes" variant="secondary" size="sm">
                  Themes
                </ButtonLink>
              </div>
            }
          />
          <Suspense fallback={<CatalogueSkeleton cards={2} />}>
            <CataloguePreview />
          </Suspense>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Downloads"
            title="Releases & Versionen"
            description="Stabile Versionen und Beta-Builds werden getrennt gekennzeichnet. Download-Links stammen ausschließlich aus den Release-Daten."
            action={
              <ButtonLink href="/releases" variant="secondary" size="sm">
                Alle Releases
              </ButtonLink>
            }
          />
          <Suspense
            fallback={
              <div className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            }
          >
            <ReleasesPreview />
          </Suspense>
        </Container>
      </section>

      <section className="border-t border-white/[0.07] bg-white/[0.015] py-16 sm:py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                Dokumentation
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Ein Einstieg, der zum tatsächlichen Code passt
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                Die Projektinformationen fassen Architektur, Installation und bekannte
                Einschränkungen zusammen. Für Details bleiben die Markdown-Dokumente im
                Repository maßgeblich – es gibt bewusst keine zweite Dokumentationsplattform.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/docs" size="sm">
                  <BookIcon className="h-4 w-4" />
                  Projektinformationen
                </ButtonLink>
                <a
                  href={REPOSITORY_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08]"
                >
                  docs/ im Repository <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b10] p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <GitHubIcon className="h-4 w-4" />
                Open Source
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Der Quellcode dieser Website ist öffentlich. Fehler und Vorschläge gehören in die
                GitHub-Issues; größere Änderungen sollten vorab abgestimmt werden. Eine
                Lizenzdatei ist im Repository derzeit nicht vorhanden.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={REPOSITORY_URL} variant="secondary" size="sm">
                  <GitHubIcon className="h-4 w-4" /> Repository
                </ButtonLink>
                <ButtonLink href={REPOSITORY_ISSUES_URL} variant="ghost" size="sm">
                  Issues <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
              <div className="mt-6 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-amber-200/90">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Frühe Entwicklungsphase: Rate-Limiting, Passwort-Reset und eine
                  Produktionsdatenbank sind noch offen.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
