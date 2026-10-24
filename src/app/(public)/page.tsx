import Image from 'next/image';
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
  CheckIcon,
  CodeIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitHubIcon,
  LayersIcon,
  PaletteIcon,
  PlugIcon,
  RadioIcon,
} from '@/components/ui/icons';
import { CatalogueSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { listPublishedPlugins, listPublishedThemes } from '@/lib/catalog';
import {
  getGitHubSnapshot,
  type GitHubRelease,
  type GitHubSnapshot,
} from '@/lib/github';
import { formatDate } from '@/lib/format';
import {
  PRODUCT_CONTRIBUTING_URL,
  PRODUCT_DOCS_URL,
  PRODUCT_ISSUES_URL,
  PRODUCT_LICENSE_URL,
  PRODUCT_PLUGIN_SDK_URL,
  PRODUCT_RELEASES_URL,
  PRODUCT_REPOSITORY_URL,
  PRODUCT_SECURITY_URL,
  PRODUCT_THEME_SDK_URL,
  SITE_TAGLINE,
} from '@/lib/site';

const FEATURES = [
  {
    title: 'Sender aus aller Welt',
    description:
      'Durchsuche Internetradios über die Radio Browser API und filtere nach Ländern und Genres. Favoriten und der Verlauf machen zuletzt Gehörtes schnell wieder auffindbar.',
    icon: RadioIcon,
  },
  {
    title: 'Native Audiopipeline',
    description:
      'Streams laufen über FFmpeg, werden als PCM verarbeitet und über eine AudioWorklet-Pipeline ausgegeben – kein HTML-Audio-Element als zentrale Wiedergabelösung.',
    icon: LayersIcon,
  },
  {
    title: 'Erweiterbar durch Plugins',
    description:
      'Das Plugin-System kennt Manifeste, Capabilities, Permissions, Lifecycle, Storage, Navigation und UI-Erweiterungen. Fähigkeiten werden vom Core geprüft.',
    icon: PlugIcon,
  },
  {
    title: 'Themes für deine Oberfläche',
    description:
      'Themes basieren auf CSS-Variablen und Theme-Paketen. Mitgeliefert sind unter anderem default, dark und neon; eigene Theme-Pakete sind möglich.',
    icon: PaletteIcon,
  },
  {
    title: 'Ein Player für alle Quellen',
    description:
      'Der Unified Player bündelt Radio und Integrationen wie YouTube hinter einer gemeinsamen API für Wiedergabe, Titel, Artwork und Provider-Status.',
    icon: CodeIcon,
  },
  {
    title: 'Favoriten, Verlauf & Rich Presence',
    description:
      'Gespeicherte Sender, zuletzt Gehörtes und Discord Rich Presence mit aktuellem Sender und Songtitel. Updates laufen über Stable-, Beta- oder Alpha-Kanal.',
    icon: CheckIcon,
  },
];

const AUDIENCES = [
  {
    title: 'Für Hörer',
    description:
      'Sender suchen, Favoriten speichern und Radio hören – ohne Entwicklungsumgebung. Windows-Installer und Linux-Pakete stehen in den GitHub-Releases bereit.',
  },
  {
    title: 'Für Entwickler',
    description:
      'Eine Electron-/React-Anwendung mit getrennten Core-, Player-, Plugin- und UI-Bereichen. Das Plugin-SDK dokumentiert Manifeste, Capabilities und öffentliche APIs.',
  },
  {
    title: 'Für Creator & Modder',
    description:
      'Eigene Plugins, Themes und Integrationen bauen. Erweiterungen fragen Fähigkeiten an; sie können Sicherheitsgrenzen nicht selbst verändern.',
  },
];

function primaryAsset(release: GitHubRelease, platform: string) {
  return release.assets.find((asset) => asset.platform === platform) ?? null;
}

function DownloadShortcuts({ release }: { release: GitHubRelease }) {
  const assets = [
    primaryAsset(release, 'windows'),
    primaryAsset(release, 'linux'),
    primaryAsset(release, 'arch'),
  ].filter((asset): asset is NonNullable<typeof asset> => asset !== null);

  if (assets.length === 0) {
    return (
      <Link
        href="/releases"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
      >
        Release-Details <ArrowRightIcon className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {assets.map((asset) => (
        <a
          key={asset.name}
          href={asset.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${asset.platformLabel}: ${release.tagName} herunterladen`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        >
          <DownloadIcon className="h-3 w-3" />
          {asset.platform === 'arch' ? 'Arch' : asset.platform === 'windows' ? 'Windows' : 'Linux'}
        </a>
      ))}
    </div>
  );
}

async function LatestReleasePanel() {
  await io();

  let snapshot: GitHubSnapshot | null = null;
  try {
    snapshot = await getGitHubSnapshot();
  } catch {
    // The hero must stay usable without GitHub. No version is invented.
  }

  const stable = snapshot?.latestStable ?? null;
  const date = stable ? formatDate(stable.publishedAt) : null;

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2rem] bg-violet-600/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b10] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            WebRadio Desktop
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Open Source
          </span>
        </div>

        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/15 bg-white shadow-2xl shadow-black/50">
            <Image
              src="/brand/webradio-logo.png"
              alt="Offizielles WebRadio-Logo"
              width={112}
              height={112}
              className="h-28 w-28 object-contain"
              priority
            />
          </div>

          <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300">
            {SITE_TAGLINE}
          </p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
            Dein Internetradio für den Desktop – mit weltweiter Sendersuche, Plugins und Themes.
          </p>

          {stable ? (
            <div className="mt-6 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Neueste stabile Version
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-white">
                    {stable.tagName}
                  </p>
                </div>
                <Badge tone="success">Stabil</Badge>
              </div>
              {date ? <p className="mt-1 text-[11px] text-zinc-500">Veröffentlicht am {date}</p> : null}
              <div className="mt-3">
                <DownloadShortcuts release={stable} />
              </div>
            </div>
          ) : (
            <div className="mt-6 w-full rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-left text-xs leading-relaxed text-amber-100">
              Release-Daten sind momentan nicht abrufbar. Die offiziellen Downloads stehen direkt
              auf GitHub bereit.
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-zinc-500">
            <span>Windows &amp; Linux</span>
            <span aria-hidden="true">·</span>
            <span>Apache-2.0</span>
            <span aria-hidden="true">·</span>
            <span>macOS derzeit nicht verfügbar</span>
          </div>

          <ButtonLink href="/releases" variant="secondary" size="sm" className="mt-5 w-full">
            Alle Releases &amp; Downloads <ArrowRightIcon className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

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
        title="Noch keine Einträge im Website-Katalog"
        description="Dieser Katalog wird von der Website verwaltet und ist neu. Es werden bewusst keine Beispieldaten angezeigt. Die im Programm mitgelieferten Themes und das Plugin-SDK sind im offiziellen Repository dokumentiert."
        icon={<PlugIcon className="h-5 w-5" />}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href={PRODUCT_PLUGIN_SDK_URL} variant="secondary" size="sm">
              Plugin SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
            </ButtonLink>
            <ButtonLink href={PRODUCT_THEME_SDK_URL} variant="ghost" size="sm">
              Theme SDK <ExternalLinkIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
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

  let snapshot: GitHubSnapshot;
  try {
    snapshot = await getGitHubSnapshot();
  } catch {
    return (
      <ErrorState
        title="Release-Daten nicht verfügbar"
        description="GitHub konnte nicht abgefragt werden. Es werden keine Ersatzversionen oder erfundenen Download-Links angezeigt."
        retryHref="/releases"
      />
    );
  }

  const candidates = [snapshot.latestStable, snapshot.latestBeta].filter(
    (release): release is GitHubRelease => release !== null,
  );

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="Noch kein öffentliches Release"
        description="GitHub meldet derzeit keine veröffentlichten Releases. Drafts werden nicht angezeigt."
        icon={<DownloadIcon className="h-5 w-5" />}
        action={
          <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary" size="sm">
            <GitHubIcon className="h-4 w-4" /> GitHub-Releases
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {candidates.map((release) => (
          <article
            key={release.id}
            className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-base font-semibold text-white">{release.tagName}</h3>
              <Badge tone={release.channel === 'beta' ? 'beta' : 'success'}>
                {release.channel === 'beta' ? 'Beta' : 'Stabil'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {formatDate(release.publishedAt)
                ? `Veröffentlicht am ${formatDate(release.publishedAt)}`
                : 'Veröffentlichungsdatum nicht verfügbar'}
            </p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">
              {release.name}
            </p>
            <div className="mt-4">
              <DownloadShortcuts release={release} />
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <p>
          {snapshot.stale
            ? 'GitHub ist derzeit nicht erreichbar; angezeigt werden die zuletzt geladenen öffentlichen Daten.'
            : 'Direkt von GitHub geladen. Drafts und reine Update-Metadaten werden nicht angezeigt.'}
        </p>
        <Link
          href="/releases"
          className="inline-flex items-center gap-1.5 font-semibold text-zinc-300 transition-colors hover:text-white"
        >
          Alle Releases <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
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
                Open Source · Windows &amp; Linux · Apache-2.0
              </div>

              <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Dein Internetradio für den{' '}
                <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                  Desktop
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                WebRadio vereint die Suche nach Sendern aus aller Welt, Favoriten und eine
                anpassbare Oberfläche in einer quelloffenen Anwendung für Windows und Linux.
                Erweitere sie mit Plugins und Themes – oder baue eigene.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/releases" size="lg">
                  <DownloadIcon className="h-4 w-4" /> WebRadio herunterladen
                </ButtonLink>
                <ButtonLink href={PRODUCT_DOCS_URL} variant="secondary" size="lg">
                  <BookIcon className="h-4 w-4" /> Dokumentation
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>

              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-white/[0.07] pt-6 text-sm">
                <div>
                  <dt className="text-zinc-500">Plattformen</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Windows &amp; Linux</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Lizenz</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Apache-2.0</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Erweiterungen</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Plugins &amp; Themes</dd>
                </div>
              </dl>
            </div>

            <Suspense
              fallback={
                <div
                  className="h-[420px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
                  aria-hidden="true"
                />
              }
            >
              <LatestReleasePanel />
            </Suspense>
          </div>
        </Container>
      </section>

      <section className="border-b border-white/[0.07] bg-white/[0.015]">
        <Container className="grid gap-6 py-8 sm:grid-cols-3">
          {AUDIENCES.map((audience) => (
            <div key={audience.title}>
              <p className="text-sm font-semibold text-zinc-200">{audience.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{audience.description}</p>
            </div>
          ))}
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Funktionen"
            title="Radio hören. Anpassen. Erweitern."
            description="Die folgenden Funktionen sind im WebRadio-Desktop-Programm umgesetzt – nicht nur geplant."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.12]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet-300">
                  <feature.icon className="h-5 w-5" />
                </span>
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
            eyebrow="Website-Katalog"
            title="Plugins und Themes für WebRadio"
            description="Dieser Katalog wird von der Website verwaltet und ist ausschließlich für das WebRadio-Desktop-Programm bestimmt. Öffentlich sichtbar sind nur freigegebene und veröffentlichte Einträge."
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
            title="Offizielle Releases von GitHub"
            description="Stabile Versionen und Beta-Builds werden getrennt dargestellt. Download-Links stammen ausschließlich aus den tatsächlich veröffentlichten GitHub-Assets."
            action={
              <ButtonLink href="/releases" variant="secondary" size="sm">
                Alle Releases
              </ButtonLink>
            }
          />
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
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
                Ein Einstieg in Programm, Plugins und Themes
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                Die offizielle Dokumentation beschreibt Architektur, Plugin-SDK, Theme-SDK,
                Capabilities und die öffentlichen APIs. Diese Website fasst den Projektstand
                zusammen und bleibt für Details auf die externen Dokumente verlinkt.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={PRODUCT_DOCS_URL} size="sm">
                  <BookIcon className="h-4 w-4" /> Offizielle Docs
                  <ExternalLinkIcon className="h-3 w-3" />
                </ButtonLink>
                <ButtonLink href="/docs" variant="secondary" size="sm">
                  Projektübersicht
                </ButtonLink>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b10] p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <GitHubIcon className="h-4 w-4" />
                Open Source auf GitHub
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Der Quellcode von WebRadio steht unter Apache-2.0. Fehler und Vorschläge gehören in
                die GitHub-Issues; Sicherheitslücken bitte über die Security Policy melden, nicht
                öffentlich.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_REPOSITORY_URL} variant="secondary" size="sm">
                  <GitHubIcon className="h-4 w-4" /> Repository
                </ButtonLink>
                <ButtonLink href={PRODUCT_ISSUES_URL} variant="ghost" size="sm">
                  Issues <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
              <div className="mt-6 flex gap-3 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.05] p-3 text-xs leading-relaxed text-emerald-100/90">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Das Desktop-Programm ist öffentlich verfügbar. Der Website-Katalog für Plugins
                  und Themes wird separat moderiert und enthält nur freigegebene Einträge.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/[0.07] pt-6 text-xs text-zinc-500">
            <a
              href={PRODUCT_LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              Apache-2.0 Lizenz <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <a
              href={PRODUCT_CONTRIBUTING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              Beitragen <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <a
              href={PRODUCT_SECURITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              Sicherheit <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <a
              href={`${PRODUCT_REPOSITORY_URL}/blob/main/docs/PRIVACY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              Datenschutz des Programms <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>

          <div className="mt-6 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-amber-200/90">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              macOS ist derzeit nicht verfügbar. Ein <code>.deb</code>-Paket ist nicht in jedem
              Release enthalten; maßgeblich sind ausschließlich die tatsächlich angehängten
              Dateien des jeweiligen Releases.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
