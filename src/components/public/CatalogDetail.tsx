import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';
import {
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitHubIcon,
  PackageIcon,
  PaletteIcon,
  PlugIcon,
} from '@/components/ui/icons';
import type { PluginDetail, ThemeDetail } from '@/lib/catalog';
import { formatDate, formatFileSize } from '@/lib/format';
import { WEBRADIO_PRODUCT_LABEL } from '@/lib/product';
import { safeHttpUrl } from '@/lib/site';

type DetailItem = PluginDetail | ThemeDetail;

export default function CatalogDetail({
  item,
  kind,
}: {
  item: DetailItem;
  kind: 'plugin' | 'theme';
}) {
  const isPlugin = kind === 'plugin';
  const Icon = isPlugin ? PlugIcon : PaletteIcon;
  const basePath = isPlugin ? '/plugins' : '/themes';
  const kindLabel = isPlugin ? 'Plugin' : 'Theme';
  const latest = item.versions.find((version) => version.isLatest) ?? item.versions[0] ?? null;
  const downloadUrl = safeHttpUrl(latest?.fileUrl);
  const githubUrl = safeHttpUrl(item.developer.githubUrl);
  const websiteUrl = safeHttpUrl(item.developer.websiteUrl);

  return (
    <>
      <div className="border-b border-white/[0.07] bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.10),transparent_55%)]">
        <Container className="py-8 sm:py-12">
          <nav aria-label="Breadcrumb" className="mb-6 text-xs text-zinc-500">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="transition-colors hover:text-zinc-300">
                  Startseite
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={basePath} className="transition-colors hover:text-zinc-300">
                  {isPlugin ? 'Plugins' : 'Themes'}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-zinc-300">
                {item.name}
              </li>
            </ol>
          </nav>

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  <Icon className="h-3 w-3" /> {kindLabel}
                </Badge>
                <Badge tone="neutral">Für {WEBRADIO_PRODUCT_LABEL}</Badge>
                {latest ? <Badge tone="accent">Version {latest.version}</Badge> : null}
                <Badge tone="success">Veröffentlicht</Badge>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {item.name}
              </h1>
              <p className="mt-2 text-sm text-zinc-400">Entwickelt von {item.developer.displayName}</p>
              <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-zinc-300">
                {item.description}
              </p>

              {item.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-zinc-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="w-full shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 lg:w-80">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Download
              </p>
              {latest ? (
                <>
                  <p className="mt-2 font-mono text-sm text-zinc-200">v{latest.version}</p>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Größe</dt>
                      <dd className="text-zinc-300">{formatFileSize(latest.fileSize) ?? 'unbekannt'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Veröffentlicht</dt>
                      <dd className="text-zinc-300">{formatDate(latest.releasedAt) ?? 'unbekannt'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Kompatibel</dt>
                      <dd className="text-right text-zinc-300">
                        {latest.minWebradioVersion ?? latest.maxWebradioVersion
                          ? `${latest.minWebradioVersion ?? '–'} bis ${latest.maxWebradioVersion ?? '–'}`
                          : 'nicht angegeben'}
                      </dd>
                    </div>
                  </dl>

                  {downloadUrl ? (
                    <ButtonLink href={downloadUrl} size="sm" className="mt-4 w-full">
                      <DownloadIcon className="h-4 w-4" /> Paket herunterladen
                    </ButtonLink>
                  ) : (
                    <p className="mt-4 rounded-lg border border-amber-400/15 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-amber-200/90">
                      Für diese Version ist kein gültiger Download-Link hinterlegt.
                    </p>
                  )}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-[11px] font-medium text-zinc-500 hover:text-zinc-300">
                      SHA-256-Prüfsumme
                    </summary>
                    <code className="mt-2 block break-all rounded-lg bg-black/40 p-2 font-mono text-[10px] text-zinc-400">
                      {latest.checksum}
                    </code>
                  </details>
                </>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-white/10 p-3 text-xs leading-relaxed text-zinc-500">
                  Für diesen Eintrag ist noch keine Version veröffentlicht.
                </p>
              )}

              <div className="mt-5 border-t border-white/[0.07] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Entwickler
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-200">
                  {item.developer.displayName}
                </p>
                {item.developer.bio ? (
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-400">
                    {item.developer.bio}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2">
                  {githubUrl ? (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 transition-colors hover:text-white"
                    >
                      <GitHubIcon className="h-3.5 w-3.5" /> GitHub-Profil
                      <ExternalLinkIcon className="h-3 w-3 text-zinc-500" />
                    </a>
                  ) : null}
                  {websiteUrl ? (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 transition-colors hover:text-white"
                    >
                      <ExternalLinkIcon className="h-3.5 w-3.5" /> Website
                    </a>
                  ) : null}
                  {!githubUrl && !websiteUrl && !item.developer.bio ? (
                    <p className="text-xs text-zinc-500">Keine weiteren Profilangaben hinterlegt.</p>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </div>

      <Container className="space-y-12 py-12">
        {item.screenshots.length > 0 ? (
          <section aria-labelledby="screenshots-heading">
            <h2 id="screenshots-heading" className="text-lg font-semibold text-white">
              Vorschauen
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {item.screenshots.map((screenshot, index) => {
                const url = safeHttpUrl(screenshot.url);
                if (!url) {
                  return null;
                }
                return (
                  <figure
                    key={`${url}-${index}`}
                    className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]"
                  >
                    {/* External previews are not proxied; plain lazy images avoid remote host config. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={screenshot.caption ?? `Vorschau von ${item.name}`}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full object-cover"
                    />
                    {screenshot.caption ? (
                      <figcaption className="px-3 py-2 text-xs text-zinc-400">
                        {screenshot.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                );
              })}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="versions-heading">
          <h2 id="versions-heading" className="text-lg font-semibold text-white">
            Versionen
          </h2>
          {item.versions.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
              Es sind noch keine Versionen veröffentlicht.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.08]">
              {item.versions.map((version) => {
                const fileUrl = safeHttpUrl(version.fileUrl);
                return (
                  <li
                    key={version.version}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-zinc-100">
                          v{version.version}
                        </span>
                        {version.isLatest ? (
                          <Badge tone="accent">
                            <CheckIcon className="h-3 w-3" /> Aktuell
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDate(version.releasedAt) ?? 'Datum unbekannt'}
                        {formatFileSize(version.fileSize)
                          ? ` · ${formatFileSize(version.fileSize)}`
                          : ''}
                      </p>
                      {version.description ? (
                        <p className="mt-1 text-sm text-zinc-400">{version.description}</p>
                      ) : null}
                    </div>
                    {fileUrl ? (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:text-white"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" /> Paket
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-500">Kein Link hinterlegt</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <PackageIcon className="h-5 w-5 text-zinc-500" />
            <p className="text-sm text-zinc-400">
              Alle Angaben stammen aus dem öffentlichen Katalog. Private Entwürfe und abgelehnte
              Einträge werden nicht ausgeliefert.
            </p>
          </div>
          <Link
            href={basePath}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
          >
            Zurück zum Katalog <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </>
  );
}
