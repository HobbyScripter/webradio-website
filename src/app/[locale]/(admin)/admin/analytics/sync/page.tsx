import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getAnalyticsSyncData } from '@/lib/analytics/queries';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { Card, Empty, ErrorPanel, SimpleTable, formatNumber } from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Synchronisierung',
  robots: { index: false, follow: false },
};

export const instant = false;

function toneFor(status: string): BadgeTone {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'PARTIAL' || status === 'PENDING') return 'warning';
  if (status === 'EMPTY' || status === 'UNSUPPORTED') return 'neutral';
  return 'accent';
}

export default async function SyncPage() {
  await connection();
  let data;
  try {
    data = await getAnalyticsSyncData();
  } catch {
    return <ErrorPanel section="Synchronisierungsstatus" />;
  }

  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-xs text-zinc-500">
        Eine fehlgeschlagene Quelle beeinträchtigt die übrigen Quellen nicht. Gespeicherte
        Daten bleiben lesbar; der Status zeigt den letzten bekannten Zustand pro Quelle.
      </p>

      <Card title="Quellenstatus" description="Letzter Erfolg und Fehler pro Datenquelle">
        <SimpleTable
          head={['Quelle', 'Status', 'Letzter Erfolg', 'Letzter Fehler', 'HTTP', 'Fehlercode']}
          empty={data.sources.length === 0}
        >
          {data.sources.map((source) => (
            <tr key={source.source}>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{source.source}</td>
              <td className="py-2 pr-4">
                <Badge tone={toneFor(source.status)}>{source.status}</Badge>
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">
                {formatDateTime(source.lastSuccessAt) ?? '–'}
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">
                {formatDateTime(source.lastFailureAt) ?? '–'}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">
                {source.lastHttpStatus ?? '–'}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">
                {source.lastErrorCode ?? '–'}
              </td>
            </tr>
          ))}
        </SimpleTable>
        {data.sources.length === 0 ? (
          <div className="mt-4">
            <Empty
              title="Noch keine Quellenstatus-Einträge"
              description="Der Orchestrator schreibt sie ab dem ersten automatischen oder manuellen Lauf."
            />
          </div>
        ) : null}
      </Card>

      <Card title="Letzte Läufe" description="Neueste 25 Einträge">
        <SimpleTable
          head={['Quelle', 'Status', 'Start', 'Dauer', 'HTTP', 'Einträge', 'Fehler']}
          empty={data.runs.length === 0}
        >
          {data.runs.map((run) => (
            <tr key={run.id}>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{run.source}</td>
              <td className="py-2 pr-4">
                <Badge tone={toneFor(run.status)}>{run.status}</Badge>
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">
                {formatDateTime(run.startedAt) ?? '–'}
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-400">
                {run.completedAt && run.startedAt
                  ? `${Math.max(
                      0,
                      Math.round(
                        (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) /
                          1000,
                      ),
                    )} s`
                  : '–'}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">
                {run.httpStatus ?? '–'}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">
                {formatNumber(run.itemCount)}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-500">
                {run.errorCode ?? '–'}
              </td>
            </tr>
          ))}
        </SimpleTable>
      </Card>
    </div>
  );
}
