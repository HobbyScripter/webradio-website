import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { getAnalyticsOverview } from '@/lib/analytics/queries';
import { Card, ErrorPanel, Stat, formatNumber } from './_ui';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Analytics – Übersicht',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function AnalyticsOverviewPage() {
  await connection();
  let data;
  try {
    data = await getAnalyticsOverview();
  } catch {
    return <ErrorPanel section="Analytics-Übersicht" />;
  }

  return (
    <div className="space-y-8">
      {data.unavailable.length > 0 ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
          <p className="font-semibold">Einige Quellen nicht verfügbar</p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            Betroffen: {data.unavailable.join(', ')}. Die Werte werden als „–“ angezeigt und
            nicht geschätzt.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="GitHub-Aufrufe (7 Tage)" value={data.github.views7} />
        <Stat label="GitHub-Clones (7 Tage)" value={data.github.clones7} />
        <Stat label="Seitenaufrufe (7 Tage)" value={data.website.pageViews7} accent />
        <Stat
          label="Download-Anfragen (7 Tage)"
          value={data.website.downloadRequests7}
          accent
          hint="Anfragen, keine bestätigten Downloads"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="GitHub"
          description="Repository- und Release-Daten von GitHub"
          actions={
            <Link href="/admin/analytics/traffic" className="text-xs font-semibold text-violet-300">
              Traffic ansehen
            </Link>
          }
        >
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Sterne</dt>
              <dd className="font-mono text-white">{formatNumber(data.github.stars)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Release-Assets</dt>
              <dd className="font-mono text-white">{formatNumber(data.github.assets)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Kumulative GitHub-Downloads</dt>
              <dd className="font-mono text-white">{formatNumber(data.github.totalDownloads)}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Website"
          description="Anonyme, aggregierte Erfassung ohne IP oder Cookies"
          actions={
            <Link href="/admin/analytics/website" className="text-xs font-semibold text-violet-300">
              Website ansehen
            </Link>
          }
        >
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Seitenaufrufe (7 Tage)</dt>
              <dd className="font-mono text-white">{formatNumber(data.website.pageViews7)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Download-Anfragen (7 Tage)</dt>
              <dd className="font-mono text-white">
                {formatNumber(data.website.downloadRequests7)}
              </dd>
            </div>
            <p className="pt-2 text-xs leading-relaxed text-zinc-500">
              GitHub-Zahlen und Website-Zahlen stammen aus getrennten Quellen und werden nicht
              miteinander verrechnet.
            </p>
          </dl>
        </Card>
      </div>

      <Card
        title="Synchronisierung"
        description="Status der zuletzt gespeicherten Läufe"
        actions={
          <Link href="/admin/analytics/sync" className="text-xs font-semibold text-violet-300">
            Details
          </Link>
        }
      >
        {data.sync ? (
          <dl className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">Letzter Erfolg</dt>
              <dd className="mt-1 text-zinc-200">
                {formatDateTime(data.sync.lastSuccessAt) ?? 'Noch kein Lauf'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">Fehlerhafte Quellen</dt>
              <dd className="mt-1 font-mono text-zinc-200">
                {formatNumber(data.sync.failingSources)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-500">Hinweis</dt>
              <dd className="mt-1 text-xs text-zinc-400">
                Der automatisierte Lauf wird in Phase 7 aktiviert.
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-zinc-400">Sync-Status ist derzeit nicht verfügbar.</p>
        )}
      </Card>
    </div>
  );
}
