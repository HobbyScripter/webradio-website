import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { io } from 'next/cache';
import CatalogCard from '@/components/public/CatalogCard';
import CatalogPagination from '@/components/public/CatalogPagination';
import CatalogToolbar from '@/components/public/CatalogToolbar';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import { PlugIcon } from '@/components/ui/icons';
import { CatalogueSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { listPublishedPlugins } from '@/lib/catalog';
import {
  PAGE_SIZE,
  buildCatalogHref,
  parseCatalogQuery,
  type RawCatalogParams,
} from '@/lib/catalog-query';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Plugin-Katalog',
  description:
    'Veröffentlichte Plugins für WebRadio: durchsuche freigegebene Erweiterungen nach Name und Beschreibung, sortiert nach Aktualität, Name oder Downloads.',
  ...(absoluteUrl('/plugins') ? { alternates: { canonical: absoluteUrl('/plugins') } } : {}),
};

async function PluginResults({ searchParams }: { searchParams: Promise<RawCatalogParams> }) {
  const params = await searchParams;
  const query = parseCatalogQuery(params);
  await io();

  let result;
  try {
    result = await listPublishedPlugins({
      q: query.q,
      sort: query.sort,
      page: query.page,
      pageSize: PAGE_SIZE,
    });
  } catch {
    return (
      <ErrorState
        title="Plugin-Katalog nicht erreichbar"
        description="Die Datenbank konnte nicht abgefragt werden. Es werden keine zwischengespeicherten oder erfundenen Einträge angezeigt."
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
                  : 'Noch keine veröffentlichten Plugins'
            }
            description={
              query.page > 1
                ? 'Die gewählte Seite liegt hinter dem Ende des Katalogs.'
                : query.q
                  ? 'Versuche einen anderen Suchbegriff oder setze die Filter zurück.'
                  : 'Der Katalog ist leer, weil noch kein Plugin freigegeben wurde. Es werden bewusst keine Beispieldaten erzeugt.'
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
                <ButtonLink href="/docs#website-katalog" variant="secondary" size="sm">
                  Katalogregeln ansehen
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
          </div>
          <CatalogPagination basePath="/plugins" query={query} hasNext={result.hasNext} />
        </>
      )}
    </>
  );
}

export default function PluginsPage({
  searchParams,
}: {
  searchParams: Promise<RawCatalogParams>;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Plugins für dein WebRadio"
        description="Freigegebene Plugins für das WebRadio-Desktop-Programm – mit Versionen, Tags und Download-Paketen. Private Entwürfe, ausstehende Einreichungen und abgelehnte Einträge bleiben unsichtbar."
        actions={
          <>
            <ButtonLink href="/docs#erweiterungen" variant="secondary">
              Plugin SDK
            </ButtonLink>
            <ButtonLink href="/developer">Entwicklerbereich</ButtonLink>
          </>
        }
      />

      <Container className="py-10">
        <Suspense fallback={<CatalogueSkeleton />}>
          <PluginResults searchParams={searchParams} />
        </Suspense>

        <p className="mt-10 text-xs leading-relaxed text-zinc-500">
          Hinweis: Alle Einträge sind ausschließlich für das WebRadio-Desktop-Programm bestimmt.
          Der Katalog zeigt nur Daten, die in PostgreSQL als veröffentlicht und freigegeben markiert
          sind. Die Installation im Programm erfolgt über das Plugin-System von WebRadio; diese
          Website ist nicht die Downloadquelle der Desktop-Anwendung.{' '}
          <Link href="/docs#website-katalog" className="text-zinc-400 underline-offset-4 hover:underline">
            Mehr zum Katalog
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
