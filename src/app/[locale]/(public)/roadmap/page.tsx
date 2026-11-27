import type { Metadata } from 'next';
import { Suspense } from 'react';
import { io } from 'next/cache';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container, PageHeader } from '@/components/ui/layout';
import { CalendarIcon, LayersIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { listRoadmapItems } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
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
    path: '/roadmap',
    title: t('meta.roadmapTitle'),
    description: t('meta.siteDescription'),
  });
}

const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  PLANNED: { label: 'Geplant', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Arbeit', tone: 'accent' },
  COMPLETED: { label: 'Abgeschlossen', tone: 'success' },
  CANCELLED: { label: 'Verworfen', tone: 'danger' },
};

async function RoadmapContent({ params }: { params: Promise<{ locale: string }> }) {
  await io();
  const locale = await getLocaleFromParams(params);

  let items;
  try {
    items = await listRoadmapItems(locale);
  } catch {
    return (
      <ErrorState
        title="Roadmap konnte nicht geladen werden"
        description="Die Roadmap ist momentan nicht erreichbar. Bitte versuche es später erneut."
        retryHref="/roadmap"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<LayersIcon className="h-5 w-5" />}
        title="Noch keine Roadmap-Einträge"
        description="Die Roadmap wird aus der Datenbank geladen. Solange keine Einträge hinterlegt sind, werden hier keine Phasen oder Termine erfunden."
        action={
          <ButtonLink href="/docs" variant="secondary" size="sm">
            Zum Projektstand
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ol className="space-y-4">
      {items.map((item) => {
        const status = STATUS_LABELS[item.status] ?? {
          label: item.status,
          tone: 'neutral' as BadgeTone,
        };
        const target = formatDate(item.targetDate);
        const completed = formatDate(item.completedAt);

        return (
          <li
            key={item.id}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">{item.title}</h2>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-400">
                  {item.description}
                </p>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            {target || completed ? (
              <div className="mt-4 flex flex-wrap gap-4 border-t border-white/[0.06] pt-3 text-xs text-zinc-500">
                {target ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" /> Ziel: {target}
                  </span>
                ) : null}
                {completed ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" /> Abgeschlossen: {completed}
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function RoadmapPage({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <>
      <PageHeader
        eyebrow="Projekt"
        title="Roadmap"
        description="Geplante, laufende und abgeschlossene Arbeiten am WebRadio-Projekt. Die Einträge werden aus PostgreSQL geladen; Priorität und Status sind keine Client-Angaben."
      />
      <Container className="py-10">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
                />
              ))}
            </div>
          }
        >
          <RoadmapContent params={params} />
        </Suspense>
      </Container>
    </>
  );
}
