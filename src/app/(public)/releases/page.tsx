import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader, SectionHeading } from '@/components/ui/layout';
import {
  AlertIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  GitHubIcon,
  PackageIcon,
  ShieldIcon,
} from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
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
    'Offizielle WebRadio-Releases direkt von GitHub: neueste stabile Version, Beta-Builds, Release Notes sowie echte Windows- und Linux-Downloads mit Größe und SHA-256-Digest.',
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

function ReleaseItem({
  release,
  featured = false,
}: {
  release: GitHubRelease;
  featured?: boolean;
}) {
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
                ? ` · ${release.assets.length} ${release.assets.length === 1 ? 'Artefakt' : 'Artefakte'}`
                : ' · keine Installationsdateien'}
            </p>
          ) : null}
        </div>

        <ButtonLink
          href={release.htmlUrl}
          variant="secondary"
          size="sm"
          className="shrink-0"
        >
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

function ReleaseSection({
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
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />
      <h2 id={id} className="sr-only">
        {title}
      </h2>
      {releases.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-4">
          {releases.map((release, index) => (
            <ReleaseItem key={release.id} release={release} featured={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

function LatestSummary({ snapshot }: { snapshot: GitHubSnapshot }) {
  const cards = [
    {
      label: 'Neueste stabile Version',
      release: snapshot.latestStable,
      tone: 'success' as const,
    },
    {
      label: 'Neueste Beta',
      release: snapshot.latestBeta,
      tone: 'beta' as const,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {card.label}
          </p>
          {card.release ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="font-mono text-xl font-semibold text-white">
                  {card.release.tagName}
                </p>
                <Badge tone={card.tone}>
                  {card.release.channel === 'stable' ? 'Stabil' : 'Beta'}
                </Badge>
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

async function ReleasesContent() {
  await io();

  let snapshot: GitHubSnapshot;
  try {
    snapshot = await getGitHubSnapshot();
  } catch {
    return (
      <ErrorState
        title="GitHub-Daten konnten nicht geladen werden"
        description="Die offiziellen Release-Daten von GitHub sind momentan nicht erreichbar. Es werden keine Ersatzversionen, erfundenen Versionsnummern oder geschätzten Download-Links angezeigt."
        retryHref="/releases"
      />
    );
  }

  if (snapshot.releases.length === 0) {
    return (
      <EmptyState
        icon={<PackageIcon className="h-5 w-5" />}
        title="Keine öffentlichen Releases gefunden"
        description="GitHub meldet für dieses Repository derzeit keine veröffentlichten Releases. Drafts und nicht öffentliche Artefakte werden grundsätzlich nicht angezeigt."
        action={
          <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary" size="sm">
            <GitHubIcon className="h-4 w-4" /> GitHub-Releases
          </ButtonLink>
        }
      />
    );
  }

  const stable = snapshot.releases
    .filter((release) => release.channel === 'stable')
    .slice(0, 5);
  const beta = snapshot.releases
    .filter((release) => release.channel === 'beta')
    .slice(0, 6);
  const alpha = snapshot.releases
    .filter((release) => release.channel === 'alpha')
    .slice(0, 6);

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
            öffentlichen Release-Daten
            {updatedAt ? ` vom ${updatedAt}` : ''}. Es werden keine neuen Versionen oder Downloads
            angenommen; für die vollständige Historie gilt die GitHub-Release-Seite.
          </p>
        </div>
      ) : null}

      <ReleaseSection
        id="stable-heading"
        eyebrow="Empfohlen"
        title="Stabile Releases"
        description="Offiziell als stabil veröffentlichte Versionen. Die Kanalzuordnung stammt aus dem GitHub-Release-Status, nicht aus einem Dateinamen."
        releases={stable}
        emptyText="Derzeit ist keine stabile Version veröffentlicht. Beta- und Alpha-Builds stehen weiter unten."
      />

      <ReleaseSection
        id="beta-heading"
        eyebrow="Vorabversionen"
        title="Beta-Builds"
        description="Als Prerelease markierte Beta-Versionen. Sie können Fehler enthalten; vor der Installation die Release Notes und Dateinamen prüfen."
        releases={beta}
        emptyText="Derzeit sind keine Beta-Builds veröffentlicht."
      />

      {alpha.length > 0 ? (
        <details className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            Weitere Vorabversionen (Alpha) anzeigen
          </summary>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Alpha-Builds sind frühe Entwicklungsstände. Sie werden hier nur aufgeführt, weil sie
            öffentlich auf GitHub veröffentlicht sind – nicht als Empfehlung.
          </p>
          <div className="mt-4 space-y-3">
            {alpha.map((release) => (
              <ReleaseItem key={release.id} release={release} />
            ))}
          </div>
        </details>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-xs leading-relaxed text-zinc-500">
        <p className="flex items-start gap-2">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span>
            Quelle ist ausschließlich{' '}
            <a
              href={PRODUCT_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 underline underline-offset-4 hover:text-white"
            >
              github.com/{snapshot.repository.fullName}/releases
            </a>
            . Download-URLs werden nur übernommen, wenn GitHub sie für ein Release dieses
            Repositories liefert. Dateigrößen und SHA-256-Digests stammen aus den GitHub-Asset-Daten.
            Eine Signaturprüfung findet im Browser nicht statt.
          </span>
        </p>
        <p>
          Release Notes werden als Text aus dem GitHub-Release übernommen und nicht als HTML
          gerendert. Drafts, unvollständige Uploads und reine Update-Metadaten (etwa{' '}
          <code className="font-mono text-[11px]">latest.yml</code> oder Blockmaps) erscheinen nicht
          als Download.
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
        description="Offizielle Releases des WebRadio-Desktop-Programms für Windows und Linux. Versionen, Release Notes und Installationsdateien werden direkt von GitHub geladen – ohne erfundene Versionen oder konstruierte Download-Links."
        actions={
          <>
            <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary">
              <GitHubIcon className="h-4 w-4" /> GitHub-Releases
            </ButtonLink>
            <ButtonLink href={PRODUCT_DOCS_URL} variant="ghost">
              Installation <ArrowRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </>
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
