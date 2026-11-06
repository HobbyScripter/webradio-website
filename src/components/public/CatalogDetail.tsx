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
  ShieldIcon,
} from '@/components/ui/icons';
import type { PluginDetail, ThemeDetail } from '@/lib/catalog';
import {
  formatCompatibility,
  githubLinkLabel,
  isPreviewVersion,
  requiresNewerStable,
} from '@/lib/catalog-display';
import { formatDate, formatFileSize } from '@/lib/format';
import { WEBRADIO_PRODUCT_LABEL } from '@/lib/product';
import { PRODUCT_PLUGIN_SDK_URL, PRODUCT_THEME_SDK_URL, safeHttpUrl } from '@/lib/site';
import MarkdownText from '@/components/public/MarkdownText';
import ChecksumCopy from '@/components/public/ChecksumCopy';
import {
  PACKAGE_UNDER_REVIEW_LABEL,
  assessDownloadUrl,
} from '@/lib/release-asset-quality';

type DetailItem = PluginDetail | ThemeDetail;

export default function CatalogDetail({
  item,
  kind,
  latestStableVersion = null,
}: {
  item: DetailItem;
  kind: 'plugin' | 'theme';
  /** Newest stable WebRadio tag, when the release data is available. */
  latestStableVersion?: string | null;
}) {
  const isPlugin = kind === 'plugin';
  const Icon = isPlugin ? PlugIcon : PaletteIcon;
  const basePath = isPlugin ? '/plugins' : '/themes';
  const kindLabel = isPlugin ? 'Plugin' : 'Theme';
  const sdkUrl = isPlugin ? PRODUCT_PLUGIN_SDK_URL : PRODUCT_THEME_SDK_URL;
  const latest = item.versions.find((version) => version.isLatest) ?? item.versions[0] ?? null;
  const downloadUrl = safeHttpUrl(latest?.fileUrl);
  const downloadPlausibility = assessDownloadUrl(downloadUrl, latest?.fileSize);
  const githubUrl = safeHttpUrl(item.developer.githubUrl);
  const websiteUrl = safeHttpUrl(item.developer.websiteUrl);
  const sourceUrl = safeHttpUrl(item.sourceUrl);
  const compatibility = latest
    ? formatCompatibility(latest.minWebradioVersion, latest.maxWebradioVersion)
    : null;
  const needsBeta =
    latest !== null && requiresNewerStable(latest.minWebradioVersion, latestStableVersion);

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
                <Badge tone="neutral">Community</Badge>
                <Badge tone="neutral">Für {WEBRADIO_PRODUCT_LABEL}</Badge>
                {latest ? <Badge tone="accent">Version {latest.version}</Badge> : null}
                {latest && isPreviewVersion(latest.version) ? (
                  <Badge tone="warning">Vorschauversion vor 1.0</Badge>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {item.name}
              </h1>
              <p className="mt-2 text-sm text-zinc-400">Entwickelt von {item.developer.displayName}</p>
              <div className="mt-5">
                <MarkdownText text={item.description} className="text-base leading-relaxed text-zinc-300" />
              </div>

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
                      <dt className="text-zinc-500">Paketgröße</dt>
                      <dd className="text-zinc-300">{formatFileSize(latest.fileSize) ?? 'unbekannt'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Zuletzt aktualisiert</dt>
                      <dd className="text-zinc-300">{formatDate(latest.releasedAt) ?? 'unbekannt'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Kompatibel</dt>
                      <dd className="text-right text-zinc-300">{compatibility ?? 'alle Versionen'}</dd>
                    </div>
                  </dl>

                  {needsBeta && latest.minWebradioVersion ? (
                    <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200/90">
                      Benötigt WebRadio {latest.minWebradioVersion}, derzeit nur als Beta
                      {latestStableVersion ? ` (stabil ist ${latestStableVersion})` : ''}.
                    </p>
                  ) : null}

                  {downloadUrl && downloadPlausibility === 'ok' ? (
                    <ButtonLink href={downloadUrl} size="sm" className="mt-4 w-full">
                      <DownloadIcon className="h-4 w-4" /> Paket herunterladen
                    </ButtonLink>
                  ) : downloadUrl ? (
                    <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200/90">
                      <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {PACKAGE_UNDER_REVIEW_LABEL}: Die hinterlegte Datei ist auffällig klein und
                        wird erst nach einer Prüfung zum Download angeboten.
                      </span>
                    </p>
                  ) : (
                    <p className="mt-4 rounded-lg border border-amber-400/15 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-amber-200/90">
                      Für diese Version ist kein Download-Link hinterlegt.
                    </p>
                  )}

                  {latest.checksum ? (
                    <ChecksumCopy checksum={latest.checksum} />
                  ) : (
                    <p className="mt-4 text-xs text-zinc-500">Für diese Version ist kein Prüfwert hinterlegt.</p>
                  )}
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
                      <GitHubIcon className="h-3.5 w-3.5" /> {githubLinkLabel(githubUrl)}
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
        <section aria-labelledby="installation-heading">
          <h2 id="installation-heading" className="text-lg font-semibold text-white">
            Installation
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Lade das Paket herunter und prüfe die Prüfsumme. Jedes {kindLabel} liegt in einem eigenen
            Ordner mit einer <code className="font-mono text-zinc-300">manifest.json</code>; genau
            diesen Ordner lädt das Programm.
          </p>
          <ol className="mt-4 max-w-3xl list-decimal space-y-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 pl-9 text-sm leading-relaxed text-zinc-400">
            <li>WebRadio starten und im Programm den Bereich für {kindLabel}s öffnen.</li>
            <li>Dort den Ordner für Erweiterungen öffnen.</li>
            <li>Das entpackte Paket als eigenen Ordner hineinlegen.</li>
            <li>Das Programm neu starten und das {kindLabel} aktivieren.</li>
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Die Schritte sind unter Windows und Linux gleich; den Ordner für Erweiterungen zeigt
            das Programm an. Weitere Hinweise stehen im{' '}
            <a
              href={sdkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              SDK
            </a>
            .
          </p>
        </section>

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
                        {formatCompatibility(version.minWebradioVersion, version.maxWebradioVersion)
                          ? ` · ab WebRadio ${formatCompatibility(
                              version.minWebradioVersion,
                              version.maxWebradioVersion,
                            )}`
                          : ''}
                      </p>
                      {version.description ? (
                        <div className="mt-1">
                          <MarkdownText
                            text={version.description}
                            className="text-sm text-zinc-400"
                          />
                        </div>
                      ) : null}
                    </div>
                    {fileUrl && assessDownloadUrl(fileUrl, version.fileSize) === 'ok' ? (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:text-white"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" /> Paket
                      </a>
                    ) : fileUrl ? (
                      <span className="text-xs font-medium text-amber-200/90">
                        {PACKAGE_UNDER_REVIEW_LABEL}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Kein Link hinterlegt</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {(sourceUrl || githubUrl) ? (
          <section aria-labelledby="source-heading">
            <h2 id="source-heading" className="text-lg font-semibold text-white">
              Quellcode
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {sourceUrl ? (
                <li>
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-zinc-300 underline-offset-4 hover:text-white hover:underline"
                  >
                    <GitHubIcon className="h-4 w-4" /> Quellcode des {kindLabel}s
                    <ExternalLinkIcon className="h-3 w-3 text-zinc-500" />
                  </a>
                </li>
              ) : null}
              {githubUrl ? (
                <li>
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-zinc-300 underline-offset-4 hover:text-white hover:underline"
                  >
                    <ExternalLinkIcon className="h-4 w-4" /> {githubLinkLabel(githubUrl)}
                  </a>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <PackageIcon className="h-5 w-5 text-zinc-500" />
            <p className="text-sm text-zinc-400">
              Fragen zum {kindLabel}? Melde dich beim Entwickler oder reiche einen Hinweis ein.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Link
              href={`/report?type=${isPlugin ? 'PLUGIN' : 'THEME'}&id=${item.id}`}
              className="text-xs font-medium text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Inhalt melden
            </Link>
            <Link
              href={basePath}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
            >
              Zurück zum Katalog <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
