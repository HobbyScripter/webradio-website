import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader, SectionHeading } from '@/components/ui/layout';
import {
  DownloadIcon,
  ExternalLinkIcon,
  GitHubIcon,
  PackageIcon,
} from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { listReleases, type ReleaseEntry } from '@/lib/catalog';
import { formatDate, formatFileSize, releaseChannel } from '@/lib/format';
import { REPOSITORY_URL, absoluteUrl, safeHttpUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Releases & Downloads',
  description:
    'Offizielle WebRadio-Releases aus der Projektdatenbank: stabile Versionen und Beta-Builds mit Release Notes, Prüfsummen und hinterlegten Download-Links.',
  ...(absoluteUrl('/releases') ? { alternates: { canonical: absoluteUrl('/releases') } } : {}),
};

function ReleaseNotes({ release }: { release: ReleaseEntry }) {
  if (release.changelogs.length === 0) {
    return null;
  }

  return (
    <ul className="mt-4 space-y-2">
      {release.changelogs.map((entry, index) => (
        <li key={`${entry.category}-${index}`} className="flex gap-2.5 text-sm text-zinc-300">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
          <span>
            {entry.category ? (
              <span className="mr-2 rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
                {entry.category}
              </span>
            ) : null}
            {entry.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReleaseCard({ release }: { release: ReleaseEntry }) {
  const downloadUrl = safeHttpUrl(release.downloadUrl);
  const isBeta = releaseChannel(release.version) === 'beta';
  const date = formatDate(release.releaseDate);

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-lg font-semibold text-white">v{release.version}</h3>
            <Badge tone={isBeta ? 'beta' : 'success'}>{isBeta ? 'Beta' : 'Stabil'}</Badge>
            {release.isLatest ? <Badge tone="accent">Aktuelles Release</Badge> : null}
          </div>
          <p className="mt-1 text-sm font-medium text-zinc-300">{release.title}</p>
          {date ? <p className="mt-1 text-xs text-zinc-500">Veröffentlicht am {date}</p> : null}
        </div>

        {downloadUrl ? (
          <ButtonLink href={downloadUrl} variant="secondary" size="sm" className="shrink-0">
            <DownloadIcon className="h-4 w-4" /> Download
          </ButtonLink>
        ) : (
          <span className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-500">
            Kein Download-Link hinterlegt
          </span>
        )}
      </div>

      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-zinc-400">
        {release.description}
      </p>

      <ReleaseNotes release={release} />

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.06] pt-4 text-xs text-zinc-500">
        {formatFileSize(release.fileSize) ? (
          <div className="flex gap-2">
            <dt>Dateigröße</dt>
            <dd className="text-zinc-300">{formatFileSize(release.fileSize)}</dd>
          </div>
        ) : null}
        {release.checksum ? (
          <div className="flex min-w-0 gap-2">
            <dt>SHA-256</dt>
            <dd className="break-all font-mono text-[10px] leading-5 text-zinc-400">
              {release.checksum}
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

async function ReleasesContent() {
  await io();

  let releases;
  try {
    releases = await listReleases(50);
  } catch {
    return (
      <ErrorState
        title="Releases konnten nicht geladen werden"
        description="Die Release-Datenbank ist momentan nicht erreichbar. Es werden keine Ersatzversionen oder erfundenen Download-Links angezeigt."
        retryHref="/releases"
      />
    );
  }

  if (releases.length === 0) {
    return (
      <EmptyState
        icon={<PackageIcon className="h-5 w-5" />}
        title="Noch kein Release veröffentlicht"
        description="Es sind keine Release-Einträge hinterlegt. Sobald ein Release in der Datenbank erfasst ist, erscheint es hier mit Datum, Kanal und – falls vorhanden – Download-Link."
        action={
          <ButtonLink href={`${REPOSITORY_URL}/releases`} variant="secondary" size="sm">
            <GitHubIcon className="h-4 w-4" /> GitHub-Releases
          </ButtonLink>
        }
      />
    );
  }

  const stable = releases.filter((release) => releaseChannel(release.version) === 'stable');
  const beta = releases.filter((release) => releaseChannel(release.version) === 'beta');

  return (
    <div className="space-y-12">
      <section aria-labelledby="stable-heading">
        <SectionHeading
          eyebrow="Empfohlen"
          title="Stabile Releases"
          description="Versionen ohne SemVer-Vorabkennzeichnung (kein Bindestrich in der Versionsnummer)."
        />
        <h2 id="stable-heading" className="sr-only">
          Stabile Releases
        </h2>
        {stable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">
            Noch kein stabiles Release veröffentlicht.
          </p>
        ) : (
          <div className="space-y-4">
            {stable.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="beta-heading">
        <SectionHeading
          eyebrow="Vorabversionen"
          title="Beta-Builds"
          description="SemVer-Vorabversionen (mit Bindestrich, z. B. -beta.1). Nicht für den produktiven Einsatz empfohlen."
        />
        <h2 id="beta-heading" className="sr-only">
          Beta-Builds
        </h2>
        {beta.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">
            Aktuell sind keine Beta-Builds veröffentlicht.
          </p>
        ) : (
          <div className="space-y-4">
            {beta.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ReleasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Downloads"
        title="Releases & Downloads"
        description="Alle Einträge stammen aus der Release-Tabelle von PostgreSQL. Der Kanal wird aus der SemVer-Version abgeleitet; Download-Links werden nur eingebunden, wenn sie als sichere HTTP(S)-URL hinterlegt sind."
        actions={
          <ButtonLink href={`${REPOSITORY_URL}/releases`} variant="secondary">
            <GitHubIcon className="h-4 w-4" /> GitHub-Releases
          </ButtonLink>
        }
      />

      <Container className="py-10">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden="true">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
                />
              ))}
            </div>
          }
        >
          <ReleasesContent />
        </Suspense>

        <div className="mt-12 space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-xs leading-relaxed text-zinc-500">
          <p>
            Alle Einträge sind offizielle Releases des WebRadio-Desktop-Programms. Das
            Release-Datenmodell enthält keine Plattformangaben; deshalb werden hier keine
            unterstützten Betriebssysteme oder Architekturen behauptet.
          </p>
          <p>
            Prüfsummen werden angezeigt, wenn sie hinterlegt sind. Eine automatische
            Signaturprüfung im Browser findet nicht statt.{' '}
            <a
              href={`${REPOSITORY_URL}/blob/master/docs/ARCHITECTURE.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-400 underline-offset-4 hover:underline"
            >
              Architekturhinweise <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </p>
        </div>
      </Container>
    </>
  );
}
