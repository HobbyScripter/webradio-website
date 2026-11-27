import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getRepositoryAnalytics } from '@/lib/analytics/queries';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { Card, CountList, Empty, ErrorPanel, SimpleTable, Stat, formatNumber } from '../_ui';

export const metadata: Metadata = {
  title: 'Analytics – Repository',
  robots: { index: false, follow: false },
};

export const instant = false;

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export default async function RepositoryPage() {
  await connection();
  let data;
  try {
    data = await getRepositoryAnalytics();
  } catch {
    return <ErrorPanel section="Repository-Statistiken" />;
  }

  return (
    <div className="space-y-8">
      {data.metadata ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Sterne" value={data.metadata.stars} />
          <Stat label="Forks" value={data.metadata.forks} />
          <Stat label="Watcher" value={data.metadata.watchers} />
          <Stat label="Offene Issues" value={data.metadata.openIssues} />
        </div>
      ) : (
        <Empty title="Noch keine Repository-Metadaten" />
      )}

      {data.metadata ? (
        <Card
          title="Repository"
          description={`Sprache ${data.metadata.language ?? 'unbekannt'} · Lizenz ${data.metadata.license ?? 'unbekannt'}`}
          actions={
            <span className="text-xs text-zinc-500">
              Stand {formatDateTime(data.metadata.capturedFor) ?? '–'}
            </span>
          }
        >
          {data.metadata.topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.metadata.topics.map((topic) => (
                <Badge key={topic} tone="neutral">
                  {topic}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Keine Topics hinterlegt.</p>
          )}
        </Card>
      ) : null}

      <Card title="Commit-Aktivität" description="Letzte 12 Wochen, GitHub-Wochenbuckets">
        <SimpleTable
          head={['Woche', 'Commits', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']}
          empty={data.commitWeeks.length === 0}
        >
          {data.commitWeeks.map((week) => (
            <tr key={week.weekStart}>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{week.weekStart}</td>
              <td className="py-2 pr-4 text-zinc-200">{formatNumber(week.total)}</td>
              {week.days.map((value, index) => (
                <td key={`${week.weekStart}-${index}`} className="py-2 pr-3 text-xs text-zinc-400">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </SimpleTable>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Top-Contributors"
          description={data.contributorCapture ? `Snapshot ${data.contributorCapture.slice(0, 10)}` : undefined}
        >
          <CountList rows={data.contributors} emptyLabel="Keine Contributors gespeichert." />
        </Card>

        <Card title="Punch Card" description="Top-Zeitfenster, Wochentag und Stunde (UTC)">
          {data.punchCard.length === 0 ? (
            <Empty title="Keine Punch-Card-Daten" />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.punchCard.map((slot) => (
                <li key={`${slot.weekday}-${slot.hour}`} className="flex justify-between gap-4">
                  <span className="text-zinc-400">
                    {WEEKDAYS[slot.weekday] ?? '?'} {String(slot.hour).padStart(2, '0')}:00
                  </span>
                  <span className="font-mono text-zinc-200">{formatNumber(slot.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Code-Frequenz" description="Additionen und Deletionen pro Woche">
          <SimpleTable
            head={['Woche', 'Additionen', 'Deletionen']}
            empty={data.codeFrequency.length === 0}
          >
            {data.codeFrequency.map((week) => (
              <tr key={week.weekStart}>
                <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{week.weekStart}</td>
                <td className="py-2 pr-4 text-emerald-300">+{formatNumber(week.additions)}</td>
                <td className="py-2 pr-4 text-rose-300">−{formatNumber(week.deletions)}</td>
              </tr>
            ))}
          </SimpleTable>
        </Card>

        <Card title="Participation" description="Commits gesamt und vom Repository-Owner">
          <SimpleTable
            head={['Woche', 'Alle', 'Owner']}
            empty={data.participation.length === 0}
          >
            {data.participation.map((week) => (
              <tr key={week.weekStart}>
                <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{week.weekStart}</td>
                <td className="py-2 pr-4 text-zinc-200">{formatNumber(week.allCount)}</td>
                <td className="py-2 pr-4 text-zinc-200">{formatNumber(week.ownerCount)}</td>
              </tr>
            ))}
          </SimpleTable>
        </Card>
      </div>
    </div>
  );
}
