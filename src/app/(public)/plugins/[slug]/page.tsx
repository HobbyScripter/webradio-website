import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CatalogDetail from '@/components/public/CatalogDetail';
import { Container } from '@/components/ui/layout';
import { ErrorState } from '@/components/ui/states';
import { getPublishedPluginBySlug } from '@/lib/catalog';
import { absoluteUrl } from '@/lib/site';

// Detail pages must be able to answer with a real 404 status, so this route
// opts out of instant-navigation streaming and blocks on the slug lookup.
export const instant = false;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const plugin = await getPublishedPluginBySlug(slug);
    if (!plugin) {
      // Called before the page streams, so the response keeps a real 404 status.
      notFound();
    }

    const description =
      plugin.description.length > 155 ? `${plugin.description.slice(0, 152)}…` : plugin.description;
    const canonical = absoluteUrl(`/plugins/${plugin.slug}`);

    return {
      title: plugin.name,
      description,
      openGraph: {
        type: 'article',
        title: plugin.name,
        description,
        ...(canonical ? { url: canonical } : {}),
      },
      ...(canonical ? { alternates: { canonical } } : {}),
    };
  } catch {
    return { title: 'Plugin', robots: { index: false, follow: false } };
  }
}

export default async function PluginDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let plugin;
  try {
    plugin = await getPublishedPluginBySlug(slug);
  } catch {
    return (
      <Container className="py-16">
        <ErrorState
          title="Plugin konnte nicht geladen werden"
          description="Die Datenbank ist momentan nicht erreichbar. Bitte versuche es später erneut."
          retryHref={`/plugins/${encodeURIComponent(slug)}`}
        />
      </Container>
    );
  }

  if (!plugin) {
    notFound();
  }

  return <CatalogDetail item={plugin} kind="plugin" />;
}
