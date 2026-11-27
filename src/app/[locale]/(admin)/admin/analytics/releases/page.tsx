import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getReleaseAnalytics } from '@/lib/analytics/queries';
import {
  Card,
  ChannelBadge,
  Empty,
  ErrorPanel,
  SimpleTable,
  Stat,
  CountList,
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
      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Assets" value={data.assetCount} />
        <Stat label="GitHub-Downloads gesamt" value={data.totalDownloads} hint="Kumulative Zähler" accent />
        <Stat label="Stable" value={data.channels.stable} />
        <Stat label="RC" value={data.channels.rc} hint="Release Candidates" />
        <Stat label="Beta / Alpha" value={data.channels.beta + data.channels.alpha} />
      </div>

      {/* Per-Release Overview */}
      <Card title="Releases" description="Gesamtdownloads je Release (kumulative GitHub-Zähler)">
        <SimpleTable
          head={['Tag', 'Kanal', 'Assets', 'Downloads', 'Veröffentlicht']}
          empty={data.releaseGroups.length === 0}
        >
          {data.releaseGroups.map((rel) => (
            <tr key={rel.tag} className="align-middle">
              <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{rel.tag}</td>
              <td className="py-2 pr-4">
                <ChannelBadge channel={rel.channel} />
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">{rel.assetCount}</td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-200">{formatNumber(rel.totalDownloads)}</td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-500">
                {rel.publishedAt ? rel.publishedAt.slice(0, 10) : '–'}
              </td>
            </tr>
          ))}
        </SimpleTable>
      </Card>

      {/* Platform / Format / Arch */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Nach Betriebssystem" description="GitHub-Downloads je Plattform">
          <CountList rows={data.byPlatform} />
        </Card>
        <Card title="Nach Paketformat" description="Installer, AppImage, DMG…">
          <CountList rows={data.byFormat} />
        </Card>
        <Card title="Nach Architektur" description="Aus Dateinamen abgeleitet">
          <CountList rows={data.byArch} />
        </Card>
      </div>

      {/* Full Asset Table */}
      <Card
        title="Alle Release-Assets"
        description="Kanal, Plattform, Größe, Prüfsumme und letzte Download-Differenz"
      >
        <SimpleTable
          head={['Tag', 'Kanal', 'Datei', 'Plattform', 'Arch', 'Größe', 'Downloads', 'Differenz']}
          empty={data.assets.length === 0}
        >
          {data.assets.map((asset) => (
            <tr key={asset.id} className="align-top">
              <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{asset.tag}</td>
              <td className="py-2 pr-4">
                <ChannelBadge channel={asset.channel} />
              </td>
              <td className="max-w-[200px] py-2 pr-4 text-xs text-zinc-300">
                <span className="block truncate" title={asset.fileName}>
                  {asset.fileName}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">{asset.platform}</td>
              <td className="py-2 pr-4 text-xs text-zinc-500">{asset.arch || '–'}</td>
              <td className="py-2 pr-4 text-xs text-zinc-500">
                {asset.size > 0 ? `${Math.round(asset.size / 1024 / 1024)} MB` : '–'}
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
