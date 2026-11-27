import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  getDownloadRequestAnalytics,
  parseAnalyticsWindow,
  type AnalyticsWindow,
} from '@/lib/analytics/queries';
import { Card, CountList, DaysFilter, ErrorPanel, SimpleTable, Stat, formatNumber } from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Downloads',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function DownloadRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await connection();
  const days = parseAnalyticsWindow((await searchParams).days) as AnalyticsWindow;

  let data;
  try {
    data = await getDownloadRequestAnalytics(days);
  } catch {
    return <ErrorPanel section="Download-Anfragen" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-zinc-500">
          Gezählt werden Anfragen an <code className="text-zinc-400">/api/downloads</code>.
          Ein bestätigter erfolgreicher Download ist damit nicht belegt.
        </p>
        <DaysFilter basePath="/admin/analytics/downloads" days={days} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Anfragen gesamt" value={data.totalRequests} accent />
        <Stat label="Kanal (Top)" value={data.byChannel[0]?.label ?? '–'} />
        <Stat label="Plattform (Top)" value={data.byPlatform[0]?.label ?? '–'} />
        <Stat label="Architektur (Top)" value={data.byArch[0]?.label ?? '–'} />
      </div>

      <Card title="Tagesverlauf" description="Anonyme Tagesaggregate">
        <SimpleTable head={['Tag', 'Anfragen']} empty={data.daily.length === 0}>
          {data.daily.map((row) => (
            <tr key={row.day}>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{row.day}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(row.count)}</td>
            </tr>
          ))}
        </SimpleTable>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Nach Kanal">
          <CountList rows={data.byChannel} />
        </Card>
        <Card title="Nach Plattform">
          <CountList rows={data.byPlatform} />
        </Card>
        <Card title="Nach Architektur" description="Aus dem Dateinamen abgeleitet">
          <CountList rows={data.byArch} />
        </Card>
        <Card title="Nach Land" description="Nur Hoster-Header, keine GeoIP-Abfrage">
          <CountList rows={data.byCountry} />
        </Card>
        <Card title="Nach Referrer" description="Nur normalisierter Hostname, keine vollständige URL">
          <CountList rows={data.byReferrer} />
        </Card>
      </div>
    </div>
  );
}
