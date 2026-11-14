import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  getAudienceAnalytics,
  parseAnalyticsWindow,
  type AnalyticsWindow,
} from '@/lib/analytics/queries';
import { Card, CountList, DaysFilter, ErrorPanel } from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Zielgruppe',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await connection();
  const days = parseAnalyticsWindow((await searchParams).days) as AnalyticsWindow;

  let data;
  try {
    data = await getAudienceAnalytics(days);
  } catch {
    return <ErrorPanel section="Zielgruppen-Analytics" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-zinc-500">
          Zielgruppenwerte sind grobe, anonyme Aggregate. Seitenaufrufe und Download-Anfragen
          werden getrennt ausgewiesen und nicht zu einer Gesamtzahl addiert.
        </p>
        <DaysFilter basePath="/admin/analytics/audience" days={days} />
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-violet-300">
          Website-Aufrufe
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Länder">
            <CountList rows={data.pageViews.byCountry} />
          </Card>
          <Card title="Betriebssysteme">
            <CountList rows={data.pageViews.byOs} />
          </Card>
          <Card title="Geräteklassen">
            <CountList rows={data.pageViews.byDevice} />
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-violet-300">
          Download-Anfragen
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Länder">
            <CountList rows={data.downloadRequests.byCountry} />
          </Card>
          <Card title="Plattformen">
            <CountList rows={data.downloadRequests.byPlatform} />
          </Card>
        </div>
      </section>
    </div>
  );
}
