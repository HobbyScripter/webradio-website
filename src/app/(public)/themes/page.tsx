import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import CatalogCard, { CatalogSubmitCard } from '@/components/public/CatalogCard';
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
import { shouldShowSortControls } from '@/lib/catalog-display';
import { PRODUCT_THEME_SDK_URL, absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Theme-Katalog',
  description:
    'Themes für WebRadio: Oberflächen aus der Community mit Versionen, Tags und Vorschauen.',
  openGraph: {
    title: 'Theme-Katalog · WebRadio',
    description:
      'Themes für WebRadio: Oberflächen aus der Community mit Versionen, Tags und Vorschauen.',
    ...(absoluteUrl('/themes') ? { url: absoluteUrl('/themes') } : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Theme-Katalog · WebRadio',
    description:
      'Themes für WebRadio: Oberflächen aus der Community mit Versionen, Tags und Vorschauen.',
  },
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
        description="Der Katalog konnte nicht geladen werden. Bitte versuche es in einem Moment erneut."
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
        showSort={shouldShowSortControls(result.items.length, result.hasNext)}
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
                  : 'Noch keine Themes im Katalog'
            }
            description={
              query.page > 1
                ? 'Die gewählte Seite liegt hinter dem Ende des Katalogs.'
                : query.q
                  ? 'Versuche einen anderen Suchbegriff oder setze die Filter zurück.'
                  : 'Sobald ein Theme freigegeben ist, erscheint es hier.'
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
                <ButtonLink
                  href={PRODUCT_THEME_SDK_URL}
                  variant="secondary"
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Theme SDK ansehen
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
            <CatalogSubmitCard kind="theme" sdkHref={PRODUCT_THEME_SDK_URL} />
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
        description="Oberflächen aus der Community – mit Versionen, Tags und Vorschaubildern. Jedes Theme ist für das WebRadio-Programm bestimmt."
        actions={
          <>
            <ButtonLink href={PRODUCT_THEME_SDK_URL} variant="secondary">
              Theme SDK
            </ButtonLink>
            <ButtonLink href="/developer">Entwicklerbereich</ButtonLink>
          </>
        }
      />

      <Container className="py-10">
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Themes ändern das Aussehen von WebRadio. Installiere ein Theme über den Katalog im Programm
          oder lade es von der Detailseite herunter.
        </p>

        <Suspense fallback={<CatalogueSkeleton />}>
          <ThemeResults searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}
