import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getReleaseAnalytics } from '@/lib/analytics/queries';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  Empty,
  ErrorPanel,
  ReleaseMeta,
  SimpleTable,
  Stat,
  formatNumber,
} from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Releases',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function ReleasesPage() {
  await connection();
  let data;
  try {
    data = await getReleaseAnalytics();
  } catch {
    return <ErrorPanel section="Release-Analytics" />;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Assets" value={data.assetCount} />
        <Stat label="GitHub-Downloads gesamt" value={data.totalDownloads} hint="Kumulative Zähler" />
        <Stat label="Stabil" value={data.channels.stable} />
        <Stat label="Beta / Alpha" value={data.channels.beta + data.channels.alpha} />
      </div>

      <Card
        title="Release-Assets"
        description="Kanal, Plattform, Größe, Prüfsumme und letzte Download-Differenz"
      >
        <SimpleTable
          head={['Tag', 'Kanal', 'Datei', 'Plattform', 'Metadaten', 'Downloads', 'Differenz']}
          empty={data.assets.length === 0}
        >
          {data.assets.map((asset) => (
            <tr key={asset.id} className="align-top">
              <td className="py-2 pr-4 font-mono text-xs text-zinc-300">
                {asset.tag}
                {asset.prerelease ? (
                  <Badge tone="beta" className="ml-2">
                    Pre
                  </Badge>
                ) : null}
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">{asset.channel}</td>
              <td className="max-w-[220px] py-2 pr-4 text-xs text-zinc-300">
                <span className="block truncate" title={asset.fileName}>
                  {asset.fileName}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">{asset.platform}</td>
              <td className="py-2 pr-4">
                <ReleaseMeta size={asset.size} publishedAt={asset.publishedAt} digest={asset.digest} />
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-200">
                {formatNumber(asset.downloads)}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-emerald-300">
                {asset.latestDelta === null ? '–' : `+${formatNumber(asset.latestDelta)}`}
              </td>
            </tr>
          ))}
        </SimpleTable>
      </Card>

      {data.assets.length === 0 ? (
        <Empty
          title="Noch keine Release-Daten"
          description="Der Download-Sync legt Assets und Tages-Snapshots an."
        />
      ) : null}
    </div>
  );
}
