import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CatalogDetail from '@/components/public/CatalogDetail';
import { markdownToPlainText } from '@/components/public/MarkdownText';
import { Container } from '@/components/ui/layout';
import { ErrorState } from '@/components/ui/states';
import { getCachedThemeBySlug } from '@/lib/cached-content';
import { getReleases } from '@/lib/github';
import { absoluteUrl } from '@/lib/site';
import { socialImagesFor } from '@/lib/metadata';
import { alternatesFor } from '@/lib/seo';
import { localizePath } from '@/i18n/config';
import { getLocaleFromParams } from '@/i18n/server';

/** Newest stable WebRadio tag, or null when the release data is unavailable. */
async function latestStableVersion(): Promise<string | null> {
  try {
    const { data } = await getReleases();
    return data.find((release) => release.channel === 'stable')?.tagName ?? null;
  } catch {
    return null;
  }
}

// Detail pages must be able to answer with a real 404 status, so this route
// opts out of instant-navigation streaming and blocks on the slug lookup.
export const instant = false;

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocaleFromParams(params);

  try {
    const theme = await getCachedThemeBySlug(slug, locale);
    if (!theme) {
      // Called before the page streams, so the response keeps a real 404 status.
      notFound();
    }

    const description = markdownToPlainText(theme.description, 155);
    const path = `/themes/${theme.slug}`;
    const canonical = absoluteUrl(localizePath(locale, path));
    const alternates = alternatesFor(locale, path);
    const socialTitle = `${theme.name} · WebRadio`;

    return {
      title: theme.name,
      description,
      openGraph: {
        type: 'article',
        title: socialTitle,
        description,
        images: socialImagesFor(theme.screenshots[0]?.url),
        ...(canonical ? { url: canonical } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title: socialTitle,
        description,
      },
      alternates,
    };
  } catch {
    return { title: 'Theme', robots: { index: false, follow: false } };
  }
}

export default async function ThemeDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLocaleFromParams(params);

  let theme;
  try {
    theme = await getCachedThemeBySlug(slug, locale);
  } catch {
    return (
      <Container className="py-16">
        <ErrorState
          title="Theme konnte nicht geladen werden"
          description="Die Datenbank ist momentan nicht erreichbar. Bitte versuche es später erneut."
          retryHref={`/themes/${encodeURIComponent(slug)}`}
        />
      </Container>
    );
  }

  if (!theme) {
    notFound();
  }

  return <CatalogDetail item={theme} kind="theme" latestStableVersion={await latestStableVersion()} />;
}
