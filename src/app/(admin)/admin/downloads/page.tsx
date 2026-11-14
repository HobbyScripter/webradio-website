import type { Metadata } from 'next';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { Container, PageHeader } from '@/components/ui/layout';
import { Badge } from '@/components/ui/badge';
import { formatFileSize, formatDateTime } from '@/lib/format';
import { ShieldIcon } from '@/components/ui/icons';
import { getDownloadAnalyticsData } from '@/lib/download-analytics-service';
import SyncButton from './sync-button';

export const metadata: Metadata = {
  title: 'Download Analytics',
  robots: { index: false, follow: false },
};

export default async function DownloadAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await getServerAuthSession();
  if (!session?.user || !hasRole(session.user.role, 'ADMIN')) {
    redirect('/auth/login?callbackUrl=/admin/downloads');
  }

  const { days: daysParam } = await searchParams;
  const daysBack = daysParam === '7' ? 7 : daysParam === '90' ? 90 : 30;

  const data = await getDownloadAnalyticsData(daysBack);

  return (
    <Container className="space-y-10 py-8">
      <PageHeader
        eyebrow="Statistik & Auswertung"
        title="Download Analytics"
        description="Getrennte Erfassung von GitHub Release Downloads (kumulativ) und kontrollierten Website-Download-Aufrufen."
        actions={<SyncButton />}
      />

      {/* 1. Übersicht / Summary Cards */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Übersicht der Download-Kennzahlen
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              GitHub Downloads gesamt
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-white">
              {data.summary.totalGitHubDownloads.toLocaleString('de-DE')}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Kumulative Zählerstände laut GitHub</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Website-Aufrufe gesamt
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-violet-300">
              {data.summary.totalWebsiteDownloads.toLocaleString('de-DE')}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Über /api/downloads weitergeleitet</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Downloads nach Kanal
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-emerald-400">Stabil:</span>
                <span className="font-mono font-semibold text-white">
                  {data.summary.channelDownloads.stable.toLocaleString('de-DE')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-violet-400">Beta:</span>
                <span className="font-mono font-semibold text-white">
                  {data.summary.channelDownloads.beta.toLocaleString('de-DE')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400">Alpha:</span>
                <span className="font-mono font-semibold text-white">
                  {data.summary.channelDownloads.alpha.toLocaleString('de-DE')}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              GitHub-Synchronisierung
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge
                tone={
                  data.summary.syncStatus === 'SUCCESS'
                    ? 'success'
                    : data.summary.syncStatus === 'FAILED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {data.summary.syncStatus === 'SUCCESS'
                  ? 'Erfolgreich'
                  : data.summary.syncStatus === 'FAILED'
                  ? 'Fehlgeschlagen'
                  : data.summary.syncStatus === 'RUNNING'
                  ? 'Aktiv'
                  : 'Ausstehend'}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {data.summary.lastSyncedAt
                ? `Zuletzt: ${formatDateTime(data.summary.lastSyncedAt)}`
                : 'Noch kein Sync ausgeführt'}
            </p>
            {data.summary.lastSyncError ? (
              <p className="mt-1 line-clamp-1 text-[11px] text-rose-400" title={data.summary.lastSyncError}>
                {data.summary.lastSyncError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* 2. Verlauf / Daily History mit Filter */}
      <section aria-labelledby="history-heading" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="history-heading" className="text-lg font-bold text-white">
              Täglicher Verlauf
            </h2>
            <p className="text-xs text-zinc-400">
              Getrennte Darstellung von errechneten GitHub-Tagesdifferenzen und Website-Aufrufen.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-1 text-xs">
            <a
              href="/admin/downloads?days=7"
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                daysBack === 7 ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              7 Tage
            </a>
            <a
              href="/admin/downloads?days=30"
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                daysBack === 30 ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              30 Tage
            </a>
            <a
              href="/admin/downloads?days=90"
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                daysBack === 90 ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              90 Tage
            </a>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0b0b10]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-400">
                <th className="p-3.5 font-semibold">Datum (UTC)</th>
                <th className="p-3.5 font-semibold">GitHub-Zählerdifferenz (Neu)</th>
                <th className="p-3.5 font-semibold">Website-Download-Aufrufe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.dailyHistory.map((row) => (
                <tr key={row.date} className="hover:bg-white/[0.02]">
                  <td className="p-3.5 font-mono text-zinc-300">{row.date}</td>
                  <td className="p-3.5 font-mono font-semibold text-white">
                    +{row.gitHubDifference.toLocaleString('de-DE')}
                  </td>
                  <td className="p-3.5 font-mono font-semibold text-violet-300">
                    {row.websiteDownloads.toLocaleString('de-DE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Versionen und Dateien */}
      <section aria-labelledby="assets-heading" className="space-y-4">
        <div>
          <h2 id="assets-heading" className="text-lg font-bold text-white">
            Versionen und Dateien
          </h2>
          <p className="text-xs text-zinc-400">
            Aufgeschlüsselte Downloadzahlen je Release-Asset.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0b0b10]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-400">
                <th className="p-3.5 font-semibold">Release</th>
                <th className="p-3.5 font-semibold">Kanal</th>
                <th className="p-3.5 font-semibold">Dateiname</th>
                <th className="p-3.5 font-semibold">Plattform</th>
                <th className="p-3.5 font-semibold">Größe</th>
                <th className="p-3.5 font-semibold">GitHub Gesamt</th>
                <th className="p-3.5 font-semibold">Website Aufrufe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-zinc-500">
                    Noch keine Release-Assets synchronisiert. Führe oben eine Synchronisierung durch.
                  </td>
                </tr>
              ) : (
                data.assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-white/[0.02]">
                    <td className="p-3.5 font-mono font-medium text-white">{asset.releaseTag}</td>
                    <td className="p-3.5">
                      <Badge
                        tone={
                          asset.channel === 'stable'
                            ? 'success'
                            : asset.channel === 'beta'
                            ? 'beta'
                            : 'warning'
                        }
                      >
                        {asset.channel}
                      </Badge>
                    </td>
                    <td className="max-w-[200px] truncate p-3.5 font-mono text-zinc-300" title={asset.fileName}>
                      {asset.fileName}
                    </td>
                    <td className="p-3.5 text-zinc-400">{asset.platform ?? 'Unbekannt'}</td>
                    <td className="p-3.5 font-mono text-zinc-400">{formatFileSize(asset.size)}</td>
                    <td className="p-3.5 font-mono font-semibold text-white">
                      {asset.gitHubDownloads.toLocaleString('de-DE')}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-violet-300">
                      {asset.websiteDownloads.toLocaleString('de-DE')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Länderstatistik */}
      <section aria-labelledby="countries-heading" className="space-y-4">
        <div>
          <h2 id="countries-heading" className="text-lg font-bold text-white">
            Länderstatistik (Website-Aufrufe)
          </h2>
          <p className="text-xs text-zinc-400">
            Ungefähre geografische Herkunft der Website-Download-Aufrufe (aggregiert nach ISO-Ländercode).
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-zinc-400 leading-relaxed space-y-2">
          <p className="flex items-start gap-2">
            <ShieldIcon className="h-4 w-4 shrink-0 text-violet-400 mt-0.5" />
            <span>
              <strong>Datenschutz- und Genauigkeitshinweis:</strong> GitHub stellt für Release-Downloads
              grundsätzlich keine Herkunftsländer bereit. Die hier dargestellten Zahlen beziehen sich
              ausschließlich auf Aufrufe über die WebRadio-Website. Es werden keine IP-Adressen gespeichert;
              die Zuordnung erfolgt direkt beim Request über vertrauenswürdige Hoster-Header. Durch VPNs,
              Proxys und Mobilfunknetze stellt der Ländercode keine exakte Ortsbestimmung dar.
            </span>
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0b0b10]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-400">
                <th className="p-3.5 font-semibold">Ländercode</th>
                <th className="p-3.5 font-semibold">Anzahl Aufrufe</th>
                <th className="p-3.5 font-semibold">Anteil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.countries.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-zinc-500">
                    Bisher keine Website-Downloads mit Länderinformationen erfasst.
                  </td>
                </tr>
              ) : (
                data.countries.map((c) => (
                  <tr key={c.countryCode} className="hover:bg-white/[0.02]">
                    <td className="p-3.5 font-mono font-medium text-white">
                      {c.countryCode === 'XX' ? 'XX (Unbekannt)' : c.countryCode}
                    </td>
                    <td className="p-3.5 font-mono text-zinc-200">{c.count.toLocaleString('de-DE')}</td>
                    <td className="p-3.5 font-mono text-violet-300">{c.percentage}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Container>
  );
}

