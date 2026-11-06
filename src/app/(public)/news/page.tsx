import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import { ArrowRightIcon, CalendarIcon, ExternalLinkIcon, GitHubIcon, NewsIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { listPublishedNews } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { defaultSocialImages } from '@/lib/metadata';
import {
  PRODUCT_DISCUSSIONS_URL,
  PRODUCT_RELEASES_URL,
  absoluteUrl,
} from '@/lib/site';

// The page decides per request whether articles exist (navigation and robots),
// so it must not be prerendered with an empty database.
export const instant = false;

const TITLE = 'Neuigkeiten';
const DESCRIPTION = 'Projektupdates und Ankündigungen zu WebRadio.';

/**
 * The section stays out of search indexes while it has no articles: a list of
 * nothing is not useful for a visitor arriving from a search engine.
 */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  let hasEntries = false;
  try {
    const entries = await listPublishedNews(1);
    hasEntries = entries.length > 0;
  } catch {
    hasEntries = false;
  }

  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(hasEntries ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${TITLE} · WebRadio`,
      description: DESCRIPTION,
      images: defaultSocialImages(),
      ...(absoluteUrl('/news') ? { url: absoluteUrl('/news') } : {}),
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: `${TITLE} · WebRadio`,
      description: DESCRIPTION,
    },
  };
}

async function NewsContent() {
  await io();

  let entries;
  try {
    entries = await listPublishedNews(50);
  } catch {
    return (
      <ErrorState
        title="Neuigkeiten konnten nicht geladen werden"
        description="Die Beiträge sind momentan nicht erreichbar. Bitte versuche es später erneut."
        retryHref="/news"
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<NewsIcon className="h-5 w-5" />}
        title="Hier gibt es noch nichts zu lesen"
        description="Neue Beiträge erscheinen, sobald es etwas zu berichten gibt. Aktuelle Versionen und den Austausch findest du solange an diesen Stellen:"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={PRODUCT_RELEASES_URL} variant="secondary" size="sm">
              <GitHubIcon className="h-4 w-4" /> Releases <ExternalLinkIcon className="h-3 w-3" />
            </ButtonLink>
            <ButtonLink
              href={`${PRODUCT_RELEASES_URL}.atom`}
              variant="ghost"
              size="sm"
            >
              Release-Feed <ExternalLinkIcon className="h-3 w-3" />
            </ButtonLink>
            <ButtonLink href={PRODUCT_DISCUSSIONS_URL} variant="ghost" size="sm">
              Austausch <ExternalLinkIcon className="h-3 w-3" />
            </ButtonLink>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
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
        title={TITLE}
        description="Projektupdates und Ankündigungen rund um WebRadio."
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
