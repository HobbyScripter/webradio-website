import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import CatalogCard, { CatalogSubmitCard } from '@/components/public/CatalogCard';
import CatalogPagination from '@/components/public/CatalogPagination';
import CatalogToolbar from '@/components/public/CatalogToolbar';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import { PlugIcon } from '@/components/ui/icons';
import { CatalogueSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { listCachedPlugins } from '@/lib/cached-content';
import {
  PAGE_SIZE,
  buildCatalogHref,
  parseCatalogQuery,
  type RawCatalogParams,
} from '@/lib/catalog-query';
import { shouldShowSortControls } from '@/lib/catalog-display';
import { PRODUCT_PLUGIN_SDK_URL } from '@/lib/site';
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
    path: '/plugins',
    title: t('nav.plugins'),
    description: t('meta.siteDescription'),
  });
}

async function PluginResults({
  searchParams,
  params,
}: {
  searchParams: Promise<RawCatalogParams>;
  params: Promise<{ locale: string }>;
}) {
  const [rawParams, locale] = await Promise.all([searchParams, getLocaleFromParams(params)]);
  const query = parseCatalogQuery(rawParams);
  await io();

  let result;
  try {
    result = await listCachedPlugins({
      q: query.q,
      sort: query.sort,
      page: query.page,
      pageSize: PAGE_SIZE,
      locale,
    });
  } catch {
    return (
      <ErrorState
        title="Plugin-Katalog nicht erreichbar"
        description="Der Katalog konnte nicht geladen werden. Bitte versuche es in einem Moment erneut."
        retryHref="/plugins"
      />
    );
  }

  return (
    <>
      <CatalogToolbar
        action="/plugins"
        query={query}
        idPrefix="plugins"
        placeholder="Plugins nach Name oder Beschreibung durchsuchen …"
        showSort={shouldShowSortControls(result.items.length, result.hasNext)}
      />

      {result.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<PlugIcon className="h-5 w-5" />}
            tone={query.q || query.page > 1 ? 'warning' : 'neutral'}
            title={
              query.page > 1
                ? 'Keine Einträge auf dieser Seite'
                : query.q
                  ? `Keine Plugins für „${query.q}“ gefunden`
                  : 'Noch keine Plugins im Katalog'
            }
            description={
              query.page > 1
                ? 'Die gewählte Seite liegt hinter dem Ende des Katalogs.'
                : query.q
                  ? 'Versuche einen anderen Suchbegriff oder setze die Filter zurück.'
                  : 'Sobald ein Plugin freigegeben ist, erscheint es hier.'
            }
            action={
              query.page > 1 ? (
                <ButtonLink
                  href={buildCatalogHref('/plugins', query, { page: 1 })}
                  variant="secondary"
                  size="sm"
                >
                  Zur ersten Seite
                </ButtonLink>
              ) : query.q ? (
                <ButtonLink href="/plugins" variant="secondary" size="sm">
                  Filter zurücksetzen
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={PRODUCT_PLUGIN_SDK_URL}
                  variant="secondary"
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Plugin SDK ansehen
                </ButtonLink>
              )
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-zinc-500" role="status">
            {result.items.length} {result.items.length === 1 ? 'Eintrag' : 'Einträge'} auf dieser
            Seite
            {query.q ? ` für „${query.q}“` : ''}.
          </p>
          <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((item) => (
              <CatalogCard key={item.id} item={item} kind="plugin" basePath="/plugins" />
            ))}
            <CatalogSubmitCard kind="plugin" sdkHref={PRODUCT_PLUGIN_SDK_URL} />
          </div>
          <CatalogPagination basePath="/plugins" query={query} hasNext={result.hasNext} />
        </>
      )}
    </>
  );
}

export default function PluginsPage({
  searchParams,
  params,
}: {
  searchParams: Promise<RawCatalogParams>;
  params: Promise<{ locale: string }>;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Plugins für dein WebRadio"
        description="Erweiterungen aus der Community – mit Versionen, Tags und Paketen. Jeder Eintrag ist für das WebRadio-Programm bestimmt."
        actions={
          <>
            <ButtonLink href={PRODUCT_PLUGIN_SDK_URL} variant="secondary">
              Plugin SDK
            </ButtonLink>
            <ButtonLink href="/developer">Entwicklerbereich (Anmeldung erforderlich)</ButtonLink>
          </>
        }
      />

      <Container className="py-10">
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Plugins erweitern WebRadio um neue Funktionen. Installiere ein Plugin über den Katalog im Programm
          oder lade es von der Detailseite herunter.
        </p>

        <Suspense fallback={<CatalogueSkeleton />}>
          <PluginResults searchParams={searchParams} params={params} />
        </Suspense>
      </Container>
    </>
  );
}
