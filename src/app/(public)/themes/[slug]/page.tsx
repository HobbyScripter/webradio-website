import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CatalogDetail from '@/components/public/CatalogDetail';
import { Container } from '@/components/ui/layout';
import { ErrorState } from '@/components/ui/states';
import { getPublishedThemeBySlug } from '@/lib/catalog';
import { absoluteUrl } from '@/lib/site';

// Detail pages must be able to answer with a real 404 status, so this route
// opts out of instant-navigation streaming and blocks on the slug lookup.
export const instant = false;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const theme = await getPublishedThemeBySlug(slug);
    if (!theme) {
      // Called before the page streams, so the response keeps a real 404 status.
      notFound();
    }

    const description =
      theme.description.length > 155 ? `${theme.description.slice(0, 152)}…` : theme.description;
    const canonical = absoluteUrl(`/themes/${theme.slug}`);

    return {
      title: theme.name,
      description,
      openGraph: {
        type: 'article',
        title: theme.name,
        description,
        ...(canonical ? { url: canonical } : {}),
      },
      ...(canonical ? { alternates: { canonical } } : {}),
    };
  } catch {
    return { title: 'Theme', robots: { index: false, follow: false } };
  }
}

export default async function ThemeDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let theme;
  try {
    theme = await getPublishedThemeBySlug(slug);
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

  return <CatalogDetail item={theme} kind="theme" />;
}
