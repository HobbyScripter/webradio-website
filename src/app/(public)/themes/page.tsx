import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import CatalogCard from '@/components/public/CatalogCard';
import CatalogPagination from '@/components/public/CatalogPagination';
import CatalogToolbar from '@/components/public/CatalogToolbar';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import { PaletteIcon } from '@/components/ui/icons';
import { CatalogueSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { listPublishedThemes } from '@/lib/catalog';
import {
  PAGE_SIZE,
  buildCatalogHref,
  parseCatalogQuery,
  type RawCatalogParams,
} from '@/lib/catalog-query';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Theme-Katalog',
  description:
    'Veröffentlichte Themes für WebRadio: freigegebene Oberflächen-Anpassungen mit Versionen, Tags und Vorschauen aus dem öffentlichen Katalog.',
  ...(absoluteUrl('/themes') ? { alternates: { canonical: absoluteUrl('/themes') } } : {}),
};

async function ThemeResults({ searchParams }: { searchParams: Promise<RawCatalogParams> }) {
  const params = await searchParams;
  const query = parseCatalogQuery(params);
  await io();

  let result;
  try {
    result = await listPublishedThemes({
      q: query.q,
      sort: query.sort,
      page: query.page,
      pageSize: PAGE_SIZE,
    });
  } catch {
    return (
      <ErrorState
        title="Theme-Katalog nicht erreichbar"
        description="Die Datenbank konnte nicht abgefragt werden. Es werden keine zwischengespeicherten oder erfundenen Einträge angezeigt."
        retryHref="/themes"
      />
    );
  }

  return (
    <>
      <CatalogToolbar
        action="/themes"
        query={query}
        idPrefix="themes"
        placeholder="Themes nach Name oder Beschreibung durchsuchen …"
      />

      {result.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<PaletteIcon className="h-5 w-5" />}
            tone={query.q || query.page > 1 ? 'warning' : 'neutral'}
            title={
              query.page > 1
                ? 'Keine Einträge auf dieser Seite'
                : query.q
                  ? `Keine Themes für „${query.q}“ gefunden`
                  : 'Noch keine veröffentlichten Themes'
            }
            description={
              query.page > 1
                ? 'Die gewählte Seite liegt hinter dem Ende des Katalogs.'
                : query.q
                  ? 'Versuche einen anderen Suchbegriff oder setze die Filter zurück.'
                  : 'Der Katalog ist leer, weil noch kein Theme freigegeben wurde. Es werden bewusst keine Vorschauen oder Beispieldaten erzeugt.'
            }
            action={
              query.page > 1 ? (
                <ButtonLink
                  href={buildCatalogHref('/themes', query, { page: 1 })}
                  variant="secondary"
                  size="sm"
                >
                  Zur ersten Seite
                </ButtonLink>
              ) : query.q ? (
                <ButtonLink href="/themes" variant="secondary" size="sm">
                  Filter zurücksetzen
                </ButtonLink>
              ) : (
                <ButtonLink href="/docs#themes" variant="secondary" size="sm">
                  Theme-Datenmodell ansehen
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
              <CatalogCard key={item.id} item={item} kind="theme" basePath="/themes" />
            ))}
          </div>
          <CatalogPagination basePath="/themes" query={query} hasNext={result.hasNext} />
        </>
      )}
    </>
  );
}

export default function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<RawCatalogParams>;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Themes für deine Oberfläche"
        description="Freigegebene Themes mit Versionen, Tags und optionalen Vorschaubildern. Externe Vorschauen werden nur als absolute HTTP(S)-URLs eingebunden."
        actions={
          <>
            <ButtonLink href="/docs#themes" variant="secondary">
              Datenmodell
            </ButtonLink>
            <ButtonLink href="/developer">Entwicklerbereich</ButtonLink>
          </>
        }
      />

      <Container className="py-10">
        <Suspense fallback={<CatalogueSkeleton />}>
          <ThemeResults searchParams={searchParams} />
        </Suspense>

        <p className="mt-10 text-xs leading-relaxed text-zinc-500">
          Hinweis: Das Anwenden von Themes im WebRadio-Client ist noch nicht Teil dieses Stands.
          Vorschauen erscheinen nur, wenn für einen freigegebenen Eintrag tatsächlich Bild-URLs
          hinterlegt sind.
        </p>
      </Container>
    </>
  );
}
