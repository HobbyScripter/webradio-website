import Image from 'next/image';
import Link from '@/i18n/navigation';
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
  GlobeIcon,
  LayersIcon,
  PaletteIcon,
  PlugIcon,
  RadioIcon,
  ShieldIcon,
} from '@/components/ui/icons';
import { CatalogueSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { listCachedPlugins, listCachedThemes } from '@/lib/cached-content';
import {
  getGitHubSnapshot,
  type GitHubRelease,
  type GitHubSnapshot,
} from '@/lib/github';
import { formatDate } from '@/lib/format';
import { PartnerService } from '@/lib/partner/service';
import { RELATIONSHIP_TYPE } from '@/lib/advertising/labels';
import { markdownToPlainText } from '@/components/public/MarkdownText';
import { isPlausibleDownloadPackage } from '@/lib/release-asset-quality';
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
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { createServerI18n, getLocaleFromParams } from '@/i18n/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await getLocaleFromParams(params);
  const { t } = createServerI18n(locale);
  return pageMetadata({
    locale,
    path: '/',
    title: t('meta.siteTitle'),
    description: t('meta.siteDescription'),
    absoluteTitle: true,
  });
}

type Translate = ReturnType<typeof createServerI18n>['t'];

function features(t: Translate) {
  return [
    { title: t('home.features.stations.title'), description: t('home.features.stations.body'), icon: RadioIcon },
    { title: t('home.features.audio.title'), description: t('home.features.audio.body'), icon: LayersIcon },
    { title: t('home.features.plugins.title'), description: t('home.features.plugins.body'), icon: PlugIcon },
    { title: t('home.features.themes.title'), description: t('home.features.themes.body'), icon: PaletteIcon },
    { title: t('home.features.player.title'), description: t('home.features.player.body'), icon: CodeIcon },
    { title: t('home.features.presence.title'), description: t('home.features.presence.body'), icon: CheckIcon },
  ];
}

function audiences(t: Translate) {
  return [
    { title: t('home.audiences.listeners.title'), description: t('home.audiences.listeners.body') },
    { title: t('home.audiences.developers.title'), description: t('home.audiences.developers.body') },
    { title: t('home.audiences.creators.title'), description: t('home.audiences.creators.body') },
  ];
}

function primaryAsset(release: GitHubRelease, platform: string) {
  return release.assets.find((asset) => asset.platform === platform) ?? null;
}

function DownloadShortcuts({ release, t }: { release: GitHubRelease; t: Translate }) {
  const candidates = [
    primaryAsset(release, 'windows'),
    primaryAsset(release, 'linux'),
    primaryAsset(release, 'arch'),
  ].filter((asset): asset is NonNullable<typeof asset> => asset !== null);

  // A file that is implausibly small for a desktop build is not offered as a
  // button. The card still says that a package exists. See
  // `src/lib/release-asset-quality.ts`.
  const assets = candidates.filter((asset) =>
    isPlausibleDownloadPackage(asset.name, asset.size),
  );
  const underReview = assets.length === 0 && candidates.length > 0;

  if (assets.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {underReview ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-amber-200">
            <ShieldIcon className="h-3 w-3" /> {t('home.release.underReview')}
          </span>
        ) : null}
        <Link
          href="/releases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
        >
          {t('home.release.details')} <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {assets.map((asset) => (
        <a
          key={asset.name}
          href={asset.id ? `/api/downloads/${asset.id}` : asset.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('home.release.downloadAria', {
            platform: asset.platformLabel,
            version: release.tagName,
          })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        >
          <DownloadIcon className="h-3 w-3" />
          {asset.platform === 'arch' ? 'Arch' : asset.platform === 'windows' ? 'Windows' : 'Linux'}
        </a>
      ))}
    </div>
  );
}

async function LatestReleasePanel({ t }: { t: Translate }) {
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
              alt={t('home.release.logoAlt')}
              width={112}
              height={112}
              className="h-28 w-auto object-contain"
              priority
            />
          </div>

          <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300">
            {SITE_TAGLINE}
          </p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
            {t('home.release.subtitle')}
          </p>

          {stable ? (
            <div className="mt-6 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {t('home.release.latestStable')}
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-white">
                    {stable.tagName}
                  </p>
                </div>
                <Badge tone="success">{t('home.release.stable')}</Badge>
              </div>
              {date ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  {t('home.release.publishedOn', { date })}
                </p>
              ) : null}
              <div className="mt-3">
                <DownloadShortcuts release={stable} t={t} />
              </div>
            </div>
          ) : (
            <div className="mt-6 w-full rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-left text-xs leading-relaxed text-amber-100">
              {t('home.release.unavailable')}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-zinc-500">
            <span>Windows &amp; Linux</span>
            <span aria-hidden="true">·</span>
            <span>Apache-2.0</span>
            <span aria-hidden="true">·</span>
            <span>{t('home.release.macosUnavailable')}</span>
          </div>

          <ButtonLink href="/releases" variant="secondary" size="sm" className="mt-5 w-full">
            {t('home.release.all')} <ArrowRightIcon className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

async function CataloguePreview({ t }: { t: Translate }) {
  await io();

  let plugins;
  let themes;

  try {
    [plugins, themes] = await Promise.all([
      listCachedPlugins({ q: '', sort: 'newest', page: 1, pageSize: 3 }),
      listCachedThemes({ q: '', sort: 'newest', page: 1, pageSize: 3 }),
    ]);
  } catch {
    return (
      <ErrorState
        title={t('home.catalog.errorTitle')}
        description={t('home.catalog.errorBody')}
        retryHref="/plugins"
      />
    );
  }

  if (plugins.items.length === 0 && themes.items.length === 0) {
    return (
      <EmptyState
        title={t('home.catalog.emptyTitle')}
        description={t('home.catalog.emptyBody')}
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
        t={t}
        title={t('home.catalog.latestPlugins')}
        href="/plugins"
        emptyText={t('home.catalog.emptyPlugins')}
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
        t={t}
        title={t('home.catalog.latestThemes')}
        href="/themes"
        emptyText={t('home.catalog.emptyThemes')}
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
  t,
}: {
  title: string;
  href: string;
  emptyText: string;
  t: Translate;
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
          {t('home.catalog.viewAll')} <ArrowRightIcon className="h-3.5 w-3.5" />
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
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {t('home.catalog.by', { name: item.subtitle })}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-sm text-zinc-400">
                      {markdownToPlainText(item.description)}
                    </p>
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

async function ReleasesPreview({ t }: { t: Translate }) {
  await io();

  let snapshot: GitHubSnapshot;
  try {
    snapshot = await getGitHubSnapshot();
  } catch {
    return (
      <ErrorState
        title={t('home.releases.errorTitle')}
        description={t('home.releases.errorBody')}
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
        title={t('home.releases.emptyTitle')}
        description={t('home.releases.emptyBody')}
        icon={<DownloadIcon className="h-5 w-5" />}
        action={
          <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary" size="sm">
            <GitHubIcon className="h-4 w-4" /> {t('home.releases.github')}
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
                {release.channel === 'beta'
                  ? t('home.releases.beta')
                  : t('home.release.stable')}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {formatDate(release.publishedAt)
                ? t('home.release.publishedOn', { date: formatDate(release.publishedAt) ?? '' })
                : t('home.releases.dateUnknown')}
            </p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">
              {release.name}
            </p>
            <div className="mt-4">
              <DownloadShortcuts release={release} t={t} />
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <p>
          {snapshot.stale ? t('home.releases.stale') : t('home.releases.fresh')}
        </p>
        <Link
          href="/releases"
          className="inline-flex items-center gap-1.5 font-semibold text-zinc-300 transition-colors hover:text-white"
        >
          {t('home.releases.all')} <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

type PublicPartner = Awaited<ReturnType<typeof PartnerService.getPublicPartners>>[number];

/**
 * Subtle partner strip near the bottom of the homepage. It uses the same
 * approval query as `/partners` (one data read), and renders nothing when no
 * partner has an active, explicitly public relationship — the homepage never
 * advertises an empty or purely internal partner program.
 */
async function PartnerSpotlight({ t }: { t: Translate }) {
  await io();

  let partners: PublicPartner[];
  try {
    partners = await PartnerService.getPublicPartners();
  } catch {
    return null;
  }

  const visible = partners.filter((partner) => partner.relationships.length > 0).slice(0, 6);

  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-white/[0.07] py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow={t('home.partners.eyebrow')}
          title={t('home.partners.title')}
          description={t('home.partners.description')}
          action={
            <ButtonLink href="/partners" variant="secondary" size="sm">
              {t('home.partners.all')} <ArrowRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          }
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((partner) => {
            const labels = Array.from(
              new Set(
                partner.relationships.map(
                  (relationship) =>
                    RELATIONSHIP_TYPE[relationship.type] ?? relationship.type,
                ),
              ),
            );

            return (
              <li
                key={partner.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5"
              >
                {partner.logoUrl ? (
                  <img
                    src={partner.logoUrl}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] object-contain"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-violet-300">
                    <GlobeIcon className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">
                    {partner.companyName}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{labels.join(' · ')}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { t } = createServerI18n(await getLocaleFromParams(params));

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
                {t('home.hero.titleLead')}{' '}
                <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                  {t('home.hero.titleAccent')}
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                {t('home.hero.subtitle')}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/releases" size="lg">
                  <DownloadIcon className="h-4 w-4" /> {t('home.hero.download')}
                </ButtonLink>
                <ButtonLink href={PRODUCT_DOCS_URL} variant="secondary" size="lg">
                  <BookIcon className="h-4 w-4" /> {t('home.hero.docs')}
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>

              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-white/[0.07] pt-6 text-sm">
                <div>
                  <dt className="text-zinc-500">{t('home.hero.platforms')}</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Windows &amp; Linux</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{t('home.hero.license')}</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">Apache-2.0</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{t('home.hero.extensions')}</dt>
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
              <LatestReleasePanel t={t} />
            </Suspense>
          </div>
        </Container>
      </section>

      <section className="border-b border-white/[0.07] bg-white/[0.015]">
        <Container className="grid gap-6 py-8 sm:grid-cols-3">
          {audiences(t).map((audience) => (
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
            eyebrow={t('home.features.eyebrow')}
            title={t('home.features.title')}
            description={t('home.features.description')}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features(t).map((feature) => (
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
            eyebrow={t('home.catalog.eyebrow')}
            title={t('home.catalog.title')}
            description={t('home.catalog.description')}
            action={
              <div className="flex gap-2">
                <ButtonLink href="/plugins" variant="secondary" size="sm">
                  {t('nav.plugins')}
                </ButtonLink>
                <ButtonLink href="/themes" variant="secondary" size="sm">
                  {t('nav.themes')}
                </ButtonLink>
              </div>
            }
          />
          <Suspense fallback={<CatalogueSkeleton cards={2} />}>
            <CataloguePreview t={t} />
          </Suspense>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow={t('home.releases.eyebrow')}
            title={t('home.releases.title')}
            description={t('home.releases.description')}
            action={
              <ButtonLink href="/releases" variant="secondary" size="sm">
                {t('home.releases.all')}
              </ButtonLink>
            }
          />
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            }
          >
            <ReleasesPreview t={t} />
          </Suspense>
        </Container>
      </section>

      <Suspense fallback={null}>
        <PartnerSpotlight t={t} />
      </Suspense>

      <section className="border-t border-white/[0.07] bg-white/[0.015] py-16 sm:py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                {t('home.docs.eyebrow')}
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {t('home.docs.title')}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                {t('home.docs.body')}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={PRODUCT_DOCS_URL} size="sm">
                  <BookIcon className="h-4 w-4" /> {t('home.docs.official')}
                  <ExternalLinkIcon className="h-3 w-3" />
                </ButtonLink>
                <ButtonLink href="/docs" variant="secondary" size="sm">
                  {t('home.docs.overview')}
                </ButtonLink>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b10] p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <GitHubIcon className="h-4 w-4" />
                {t('home.opensource.title')}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {t('home.opensource.body')}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={PRODUCT_REPOSITORY_URL} variant="secondary" size="sm">
                  <GitHubIcon className="h-4 w-4" /> {t('home.opensource.repository')}
                </ButtonLink>
                <ButtonLink href={PRODUCT_ISSUES_URL} variant="ghost" size="sm">
                  {t('home.opensource.issues')} <ArrowRightIcon className="h-3.5 w-3.5" />
                </ButtonLink>
              </div>
              <div className="mt-6 flex gap-3 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.05] p-3 text-xs leading-relaxed text-emerald-100/90">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t('home.opensource.note')}</p>
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
              {t('home.links.license')} <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <a
              href={PRODUCT_CONTRIBUTING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              {t('home.links.contributing')} <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <a
              href={PRODUCT_SECURITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              {t('home.links.security')} <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <a
              href={`${PRODUCT_REPOSITORY_URL}/blob/main/docs/PRIVACY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
            >
              {t('home.links.privacy')} <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </div>

          <div className="mt-6 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-amber-200/90">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('home.warning.macos')}</p>
          </div>
        </Container>
      </section>
    </>
  );
}
