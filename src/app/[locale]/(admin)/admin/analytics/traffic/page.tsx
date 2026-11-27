import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  getTrafficAnalytics,
  parseAnalyticsWindow,
  type AnalyticsWindow,
} from '@/lib/analytics/queries';
import { Card, CountList, DaysFilter, Empty, ErrorPanel, SimpleTable, Stat, formatNumber } from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Traffic',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await connection();
  const days = parseAnalyticsWindow((await searchParams).days) as AnalyticsWindow;

  let data;
  try {
    data = await getTrafficAnalytics(days);
  } catch {
    return <ErrorPanel section="Traffic" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          GitHub liefert Traffic nur für 14 Tage; ältere Werte stammen aus dem eigenen Archiv.
        </p>
        <DaysFilter basePath="/admin/analytics/traffic" days={days} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aufrufe gesamt" value={data.totals.views} />
        <Stat label="Eindeutige Besucher" value={data.totals.uniqueVisitors} />
        <Stat label="Clones gesamt" value={data.totals.clones} />
        <Stat label="Eindeutige Cloner" value={data.totals.uniqueClones} />
      </div>

      <Card title="Tageswerte" description="UTC-Tage, zuletzt archivierte Werte">
        <SimpleTable
          head={['Tag', 'Aufrufe', 'Besucher', 'Clones', 'Cloner']}
          empty={data.daily.length === 0}
        >
          {data.daily.map((row) => (
            <tr key={row.day}>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{row.day}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(row.views)}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(row.uniqueVisitors)}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(row.clones)}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(row.uniqueClones)}</td>
            </tr>
          ))}
        </SimpleTable>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Top-Referrer"
          description={data.capturedFor ? `Momentaufnahme ${data.capturedFor.slice(0, 10)}` : undefined}
        >
          <CountList rows={data.referrers} emptyLabel="Keine Referrer gespeichert." />
        </Card>
        <Card
          title="Beliebteste Pfade"
          description={data.capturedFor ? `Momentaufnahme ${data.capturedFor.slice(0, 10)}` : undefined}
        >
          <CountList rows={data.paths} emptyLabel="Keine Pfade gespeichert." />
        </Card>
      </div>

      {data.daily.length === 0 && data.referrers.length === 0 ? (
        <Empty
          title="Noch keine Traffic-Daten"
          description="Sobald der Traffic-Sync läuft, erscheinen hier die archivierten GitHub-Werte."
        />
      ) : null}
    </div>
  );
}
