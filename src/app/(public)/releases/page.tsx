import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader, SectionHeading } from '@/components/ui/layout';
import { AlertIcon, ArrowRightIcon, ExternalLinkIcon, GitHubIcon, PackageIcon, ShieldIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
import DownloadButton, { type DownloadOption } from '@/components/public/DownloadButton';
import ReleaseAssets from '@/components/public/ReleaseAssets';
import ReleaseNotes from '@/components/public/ReleaseNotes';
import { getGitHubSnapshot, type GitHubRelease, type GitHubSnapshot } from '@/lib/github';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  PRODUCT_DOCS_URL,
  PRODUCT_LATEST_RELEASE_URL,
  PRODUCT_RELEASES_URL,
  absoluteUrl,
} from '@/lib/site';

export const metadata: Metadata = {
  title: 'Releases & Downloads',
  description:
    'Offizielle WebRadio-Releases von GitHub: neueste stabile Version, Beta-Builds, Release Notes sowie Windows- und Linux-Downloads mit Größe und SHA-256-Prüfsumme.',
  openGraph: {
    title: 'Releases & Downloads · WebRadio',
    description:
      'Offizielle WebRadio-Releases von GitHub: neueste stabile Version, Beta-Builds, Release Notes sowie Windows- und Linux-Downloads.',
    ...(absoluteUrl('/releases') ? { url: absoluteUrl('/releases') } : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Releases & Downloads · WebRadio',
    description:
      'Offizielle WebRadio-Releases von GitHub: neueste stabile Version, Beta-Builds, Release Notes sowie Windows- und Linux-Downloads.',
  },
  ...(absoluteUrl('/releases') ? { alternates: { canonical: absoluteUrl('/releases') } } : {}),
};

function ChannelBadge({ channel }: { channel: GitHubRelease['channel'] }) {
  if (channel === 'stable') {
    return <Badge tone="success">Stabil</Badge>;
  }
  if (channel === 'alpha') {
    return <Badge tone="warning">Alpha</Badge>;
  }
  return <Badge tone="beta">Beta</Badge>;
}

function ReleaseItem({ release, featured = false }: { release: GitHubRelease; featured?: boolean }) {
  const date = formatDate(release.publishedAt);

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-lg font-semibold text-white">{release.tagName}</h3>
            <ChannelBadge channel={release.channel} />
            {featured ? <Badge tone="accent">Aktuelle Version</Badge> : null}
          </div>
          <p className="mt-1 text-sm font-medium text-zinc-300">{release.name}</p>
          {date ? (
            <p className="mt-1 text-xs text-zinc-500">
              Veröffentlicht am {date}
              {release.assets.length > 0
                ? ` · ${release.assets.length} ${release.assets.length === 1 ? 'Datei' : 'Dateien'}`
                : ' · keine Installationsdateien'}
            </p>
          ) : null}
        </div>

        <ButtonLink href={release.htmlUrl} variant="secondary" size="sm" className="shrink-0">
          <GitHubIcon className="h-4 w-4" /> Auf GitHub
          <ExternalLinkIcon className="h-3 w-3" />
        </ButtonLink>
      </div>

      {featured ? (
        <div className="mt-5 space-y-5">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Release Notes
            </h4>
            <ReleaseNotes notes={release.notes} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Downloads
            </h4>
            <ReleaseAssets assets={release.assets} releaseUrl={release.htmlUrl} />
          </div>
        </div>
      ) : (
        <details className="group mt-4 border-t border-white/[0.06] pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-xs font-semibold text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            <span>Release Notes &amp; Downloads anzeigen</span>
            <ArrowRightIcon className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-4 space-y-5">
            <ReleaseNotes notes={release.notes} maxChars={5_000} />
            <ReleaseAssets assets={release.assets} releaseUrl={release.htmlUrl} />
          </div>
        </details>
      )}
    </article>
  );
}

/**
 * One channel. The newest two entries stay open; the rest is collapsed so the
 * page does not turn into an endless list. Releases without a downloadable file
 * are grouped separately instead of being mixed into the installable ones.
 */
function ReleaseGroup({
  id,
  eyebrow,
  title,
  description,
  releases,
  emptyText,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  releases: GitHubRelease[];
  emptyText: string;
}) {
  const downloadable = releases.filter((release) => release.assets.length > 0);
  const withoutDownloads = releases.filter((release) => release.assets.length === 0);
  const visible = downloadable.slice(0, 2);
  const older = downloadable.slice(2);

  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <SectionHeading id={id} eyebrow={eyebrow} title={title} description={description} />

      {downloadable.length === 0 && withoutDownloads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((release, index) => (
            <ReleaseItem key={release.id} release={release} featured={index === 0} />
          ))}

          {older.length > 0 ? (
            <details className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                Weitere Versionen anzeigen ({older.length})
              </summary>
              <div className="mt-4 space-y-3">
                {older.map((release) => (
                  <ReleaseItem key={release.id} release={release} />
                ))}
              </div>
            </details>
          ) : null}

          {withoutDownloads.length > 0 ? (
            <details className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                Releases ohne Installationsdateien anzeigen ({withoutDownloads.length})
              </summary>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                Diese Veröffentlichungen enthalten keine herunterladbare Datei. Sie sind hier nur
                aufgeführt, weil sie auf GitHub öffentlich sind.
              </p>
              <div className="mt-4 space-y-3">
                {withoutDownloads.map((release) => (
                  <ReleaseItem key={release.id} release={release} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}

function LatestSummary({ snapshot }: { snapshot: GitHubSnapshot }) {
  const cards = [
    { label: 'Neueste stabile Version', release: snapshot.latestStable, tone: 'success' as const },
    { label: 'Neueste Beta', release: snapshot.latestBeta, tone: 'beta' as const },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {card.label}
          </p>
          {card.release ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="font-mono text-xl font-semibold text-white">{card.release.tagName}</p>
                <Badge tone={card.tone}>{card.release.channel === 'stable' ? 'Stabil' : 'Beta'}</Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatDate(card.release.publishedAt)
                  ? `Veröffentlicht am ${formatDate(card.release.publishedAt)}`
                  : 'Veröffentlichungsdatum nicht verfügbar'}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                {card.release.assets.length > 0
                  ? card.release.assets
                      .map((asset) => asset.platformLabel)
                      .filter((label, index, all) => all.indexOf(label) === index)
                      .join(' · ')
                  : 'Keine Installationsdateien hinterlegt'}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              {card.label === 'Neueste Beta'
                ? 'Derzeit ist keine Beta veröffentlicht.'
                : 'Derzeit ist keine stabile Version veröffentlicht.'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function InstallSection() {
  return (
    <section id="installation" aria-labelledby="installation-heading" className="scroll-mt-24">
      <h2 id="installation-heading" className="text-xl font-bold tracking-tight text-white sm:text-2xl">
        Installation
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Windows</h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-400">
            <li>Die Datei mit der Endung <code className="font-mono text-zinc-300">.exe</code> herunterladen.</li>
            <li>Die Datei öffnen und den Anweisungen des Installationsprogramms folgen.</li>
            <li>WebRadio über das Startmenü starten.</li>
          </ol>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Linux</h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-400">
            <li>Die Datei mit der Endung <code className="font-mono text-zinc-300">.AppImage</code> herunterladen.</li>
            <li>Sie ausführbar machen: <code className="font-mono text-zinc-300">chmod +x WebRadio-*.AppImage</code></li>
            <li>Starten: <code className="font-mono text-zinc-300">./WebRadio-*.AppImage</code></li>
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Startet das AppImage nicht, fehlt auf dem System häufig die Bibliothek{' '}
            <code className="font-mono text-zinc-400">libfuse2</code>. Sie lässt sich über die
            Paketverwaltung der Distribution nachinstallieren.
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Für Arch Linux gibt es zusätzlich ein Paket mit der Endung{' '}
        <code className="font-mono">.pkg.tar.zst</code>, für Debian und Ubuntu ein{' '}
        <code className="font-mono">.deb</code>-Paket, sofern es im jeweiligen Release enthalten ist.
        macOS wird derzeit nicht angeboten.
      </p>
    </section>
  );
}

async function PrimaryDownload() {
  await io();

  let snapshot: GitHubSnapshot;
  try {
    snapshot = await getGitHubSnapshot();
  } catch {
    return (
      <ButtonLink href="/releases#stable-heading" variant="secondary">
        Downloads ansehen
      </ButtonLink>
    );
  }

  const stable = snapshot.latestStable;
  if (!stable || stable.assets.length === 0) {
    return (
      <ButtonLink href="/releases#stable-heading" variant="secondary">
        Downloads ansehen
      </ButtonLink>
    );
  }

  const assets: DownloadOption[] = stable.assets.map((asset) => ({
    name: asset.name,
    platform: asset.platform,
    platformLabel: asset.platformLabel,
    downloadUrl: asset.downloadUrl,
    size: asset.size,
  }));

  return (
    <DownloadButton
      assets={assets}
      version={stable.tagName.replace(/^v/i, '')}
      otherPlatformsHref="#stable-heading"
    />
  );
}

export async function ReleasesContent() {
  await io();

  let snapshot: GitHubSnapshot;
  try {
    snapshot = await getGitHubSnapshot();
  } catch {
    return (
      <ErrorState
        title="GitHub-Daten konnten nicht geladen werden"
        description="Die Release-Daten von GitHub sind momentan nicht erreichbar. Bitte versuche es in einigen Minuten erneut."
        retryHref="/releases"
      />
    );
  }

  if (snapshot.releases.length === 0) {
    return (
      <EmptyState
        icon={<PackageIcon className="h-5 w-5" />}
        title="Keine öffentlichen Releases gefunden"
        description="GitHub meldet für dieses Projekt derzeit keine veröffentlichten Releases."
        action={
          <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary" size="sm">
            <GitHubIcon className="h-4 w-4" /> Auf GitHub ansehen
          </ButtonLink>
        }
      />
    );
  }

  const stable = snapshot.releases.filter((release) => release.channel === 'stable');
  const beta = snapshot.releases.filter((release) => release.channel === 'beta');
  const alpha = snapshot.releases.filter((release) => release.channel === 'alpha');
  const updatedAt = formatDateTime(snapshot.fetchedAt);

  return (
    <div className="space-y-12">
      <LatestSummary snapshot={snapshot} />

      {snapshot.stale ? (
        <div
          role="status"
          className="flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-amber-100"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            GitHub ist derzeit nicht erreichbar. Angezeigt werden die zuletzt erfolgreich geladenen
            Release-Daten
            {updatedAt ? ` vom ${updatedAt}` : ''}. Die vollständige Historie steht auf GitHub.
          </p>
        </div>
      ) : null}

      <ReleaseGroup
        id="stable-heading"
        eyebrow="Empfohlen"
        title="Stabile Releases"
        description="Offiziell als stabil veröffentlichte Versionen."
        releases={stable}
        emptyText="Derzeit ist keine stabile Version veröffentlicht. Beta-Builds stehen weiter unten."
      />

      <ReleaseGroup
        id="beta-heading"
        eyebrow="Vorabversionen"
        title="Beta-Builds"
        description="Als Vorabversion gekennzeichnete Builds. Sie können Fehler enthalten; prüfe vor der Installation die Release Notes."
        releases={beta}
        emptyText="Derzeit sind keine Beta-Builds veröffentlicht."
      />

      {alpha.length > 0 ? (
        <details className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            Alpha-Builds anzeigen ({alpha.length})
          </summary>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Alpha-Builds sind frühe Entwicklungsstände und keine Empfehlung.
          </p>
          <div className="mt-4 space-y-3">
            {alpha.map((release) => (
              <ReleaseItem key={release.id} release={release} />
            ))}
          </div>
        </details>
      ) : null}

      <InstallSection />

      <div className="space-y-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-xs leading-relaxed text-zinc-500">
        <p className="flex items-start gap-2">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span>
            Quelle der Downloads ist ausschließlich{' '}
            <a
              href={PRODUCT_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline underline-offset-4 hover:text-white"
            >
              github.com/{snapshot.repository.fullName}/releases
            </a>
            . Dateigrößen und SHA-256-Prüfsummen stammen aus den Release-Daten.
          </span>
        </p>
        <p>
          Jede Datei lässt sich vor dem Start prüfen: unter Linux mit{' '}
          <code className="font-mono text-[11px]">sha256sum</code>, unter Windows mit{' '}
          <code className="font-mono text-[11px]">certutil -hashfile datei SHA256</code>.
          {updatedAt ? ` Datenstand: ${updatedAt}.` : ''}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary" size="sm">
            <GitHubIcon className="h-4 w-4" /> Alle Releases auf GitHub
          </ButtonLink>
          <ButtonLink href={PRODUCT_LATEST_RELEASE_URL} variant="ghost" size="sm">
            Neueste Version <ExternalLinkIcon className="h-3.5 w-3.5" />
          </ButtonLink>
          <ButtonLink href={PRODUCT_DOCS_URL} variant="ghost" size="sm">
            Dokumentation <ExternalLinkIcon className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

export default function ReleasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Downloads"
        title="WebRadio herunterladen"
        description="Offizielle Releases des WebRadio-Programms für Windows und Linux. Versionen, Release Notes und Installationsdateien stammen direkt von GitHub."
        actions={
          <Suspense
            fallback={
              <ButtonLink href="#stable-heading" variant="secondary">
                Downloads ansehen
              </ButtonLink>
            }
          >
            <PrimaryDownload />
          </Suspense>
        }
      />

      <Container className="py-10">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden="true">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
                <div className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
              </div>
              <div className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            </div>
          }
        >
          <ReleasesContent />
        </Suspense>
      </Container>
    </>
  );
}
