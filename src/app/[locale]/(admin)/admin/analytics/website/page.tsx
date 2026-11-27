import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  getWebsiteAnalytics,
  parseAnalyticsWindow,
  type AnalyticsWindow,
} from '@/lib/analytics/queries';
import { Card, CountList, DaysFilter, ErrorPanel, SimpleTable, Stat, formatNumber } from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Website',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function WebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await connection();
  const days = parseAnalyticsWindow((await searchParams).days) as AnalyticsWindow;

  let data;
  try {
    data = await getWebsiteAnalytics(days);
  } catch {
    return <ErrorPanel section="Website-Analytics" />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-zinc-500">
          Anonyme Tagesaggregate: kein IP-Speicher, keine Cookies, keine Kennungen. DNT/GPC und
          Bots werden nicht gezählt; private Routen sind ausgeschlossen.
        </p>
        <DaysFilter basePath="/admin/analytics/website" days={days} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Seitenaufrufe" value={data.totalViews} accent />
        <Stat label="Tage mit Daten" value={data.daily.length} />
        <Stat label="Top-Seite" value={data.byPath[0]?.label ?? '–'} />
        <Stat label="Top-Referrer" value={data.byReferrer[0]?.label ?? '–'} />
      </div>

      <Card title="Tagesverlauf">
        <SimpleTable head={['Tag', 'Aufrufe']} empty={data.daily.length === 0}>
          {data.daily.map((row) => (
            <tr key={row.day}>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{row.day}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(row.count)}</td>
            </tr>
          ))}
        </SimpleTable>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top-Seiten" description="Normalisierte Routen ohne Query oder Fragment">
          <CountList rows={data.byPath} />
        </Card>
        <Card title="Referrer" description="Nur Hostnamen; „direkt“ ohne Referrer">
          <CountList rows={data.byReferrer} />
        </Card>
        <Card title="Länder" description="Aus Hoster-Headern, keine externe GeoIP-Abfrage">
          <CountList rows={data.byCountry} />
        </Card>
        <Card title="Geräte und Betriebssysteme" description="Grobe Klassen, keine User-Agents">
          <div className="grid gap-6 sm:grid-cols-2">
            <CountList rows={data.byDevice} />
            <CountList rows={data.byOs} />
          </div>
        </Card>
      </div>
    </div>
  );
}
