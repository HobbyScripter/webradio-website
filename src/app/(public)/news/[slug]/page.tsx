import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/layout';
import { ArrowRightIcon, CalendarIcon } from '@/components/ui/icons';
import { ErrorState } from '@/components/ui/states';
import { getPublishedNewsBySlug } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { absoluteUrl } from '@/lib/site';

export const instant = false;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const entry = await getPublishedNewsBySlug(slug);
    if (!entry) {
      // Called before the page streams, so the response keeps a real 404 status.
      notFound();
    }

    const description =
      entry.summary.length > 155 ? `${entry.summary.slice(0, 152)}…` : entry.summary;
    const canonical = absoluteUrl(`/news/${entry.slug}`);

    return {
      title: entry.title,
      description,
      openGraph: {
        type: 'article',
        title: entry.title,
        description,
        ...(canonical ? { url: canonical } : {}),
        ...(entry.publishedAt ? { publishedTime: entry.publishedAt } : {}),
      },
      ...(canonical ? { alternates: { canonical } } : {}),
    };
  } catch {
    return { title: 'Neuigkeit', robots: { index: false, follow: false } };
  }
}

export default async function NewsDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let entry;
  try {
    entry = await getPublishedNewsBySlug(slug);
  } catch {
    return (
      <Container className="py-16">
        <ErrorState
          title="Beitrag konnte nicht geladen werden"
          description="Die Datenbank ist momentan nicht erreichbar."
          retryHref={`/news/${encodeURIComponent(slug)}`}
        />
      </Container>
    );
  }

  if (!entry) {
    notFound();
  }

  return (
    <article className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-zinc-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-zinc-300">
                Startseite
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/news" className="hover:text-zinc-300">
                Neuigkeiten
              </Link>
            </li>
          </ol>
        </nav>

        {formatDate(entry.publishedAt) ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <CalendarIcon className="h-3.5 w-3.5" />
            {formatDate(entry.publishedAt)}
          </p>
        ) : null}

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {entry.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-400">{entry.summary}</p>

        <div className="mt-8 whitespace-pre-line border-t border-white/[0.07] pt-8 text-sm leading-7 text-zinc-300">
          {entry.content}
        </div>

        <div className="mt-10 border-t border-white/[0.07] pt-6">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
          >
            <ArrowRightIcon className="h-4 w-4 rotate-180" /> Alle Neuigkeiten
          </Link>
        </div>
      </Container>
    </article>
  );
}
