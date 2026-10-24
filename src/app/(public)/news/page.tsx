import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import { ArrowRightIcon, CalendarIcon, NewsIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { listPublishedNews } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Neuigkeiten',
  description:
    'Veröffentlichte Neuigkeiten und Projektupdates zu WebRadio. Einträge erscheinen erst, wenn sie veröffentlicht und datiert sind.',
  ...(absoluteUrl('/news') ? { alternates: { canonical: absoluteUrl('/news') } } : {}),
};

async function NewsContent() {
  await io();

  let entries;
  try {
    entries = await listPublishedNews(50);
  } catch {
    return (
      <ErrorState
        title="Neuigkeiten konnten nicht geladen werden"
        description="Die Datenbank ist momentan nicht erreichbar. Es werden keine Ersatzmeldungen angezeigt."
        retryHref="/news"
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<NewsIcon className="h-5 w-5" />}
        title="Noch keine veröffentlichten Neuigkeiten"
        description="Es sind derzeit keine veröffentlichten und datierten Beiträge hinterlegt. Projektberichte findest du bis dahin in der Dokumentation im Repository."
        action={
          <ButtonLink href="/docs#dokumente" variant="secondary" size="sm">
            Zur Dokumentation
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {entries.map((entry) => (
        <article
          key={entry.id}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            {formatDate(entry.publishedAt) ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5" />
                {formatDate(entry.publishedAt)}
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">
            <Link href={`/news/${entry.slug}`} className="transition-colors hover:text-violet-200">
              {entry.title}
            </Link>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{entry.summary}</p>
          <Link
            href={`/news/${entry.slug}`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 transition-colors hover:text-violet-200"
          >
            Weiterlesen <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </article>
      ))}
    </div>
  );
}

export default function NewsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Projekt"
        title="Neuigkeiten"
        description="Veröffentlichte Projektupdates aus der Datenbank. Beiträge ohne Veröffentlichungsdatum oder mit isPublished = false bleiben unsichtbar."
      />
      <Container className="py-10">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden="true">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
                />
              ))}
            </div>
          }
        >
          <NewsContent />
        </Suspense>
      </Container>
    </>
  );
}
