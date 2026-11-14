import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AnalyticsWindow, CountRow } from '@/lib/analytics/queries';
import { formatDateTime, formatFileSize } from '@/lib/format';

export function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('de-DE')
    : '–';
}

export function Card({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">{title}</h2>
          {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`mt-2 font-mono text-2xl font-bold ${accent ? 'text-violet-300' : 'text-white'}`}
      >
        {typeof value === 'number' ? formatNumber(value) : (value ?? '–')}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-400">{hint}</p> : null}
    </div>
  );
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
      <p className="text-sm font-semibold text-zinc-300">{title}</p>
      {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
    </div>
  );
}

export function ErrorPanel({ section }: { section: string }) {
  return (
    <section className="space-y-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-6">
      <h2 className="text-base font-bold text-white">{section} nicht verfügbar</h2>
      <p className="text-sm text-zinc-300">
        Die Daten konnten nicht geladen werden. Es werden bewusst keine Ersatzzahlen angezeigt.
      </p>
      <p className="text-xs text-zinc-500">
        Ursache ist meist eine noch nicht angewendete Datenbankmigration. Die übrigen
        Analytics-Bereiche bleiben unabhängig davon nutzbar.
      </p>
    </section>
  );
}

const WINDOWS: AnalyticsWindow[] = [7, 30, 90];

export function DaysFilter({ basePath, days }: { basePath: string; days: AnalyticsWindow }) {
  return (
    <nav aria-label="Zeitraum" className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
      {WINDOWS.map((value) => (
        <Link
          key={value}
          href={`${basePath}?days=${value}`}
          aria-current={value === days ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            value === days ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {value} Tage
        </Link>
      ))}
    </nav>
  );
}

export function CountList({
  rows,
  unit = '',
  emptyLabel = 'Keine Daten im gewählten Zeitraum.',
}: {
  rows: CountRow[];
  unit?: string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <Empty title={emptyLabel} />;
  }
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-zinc-300" title={row.label}>
              {row.label}
            </span>
            <span className="shrink-0 font-mono text-xs text-zinc-400">
              {formatNumber(row.count)}
              {unit}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-violet-500/60"
              style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SimpleTable({
  head,
  children,
  empty,
}: {
  head: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return <Empty title="Keine Datensätze vorhanden." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
            {head.map((label) => (
              <th key={label} className="py-2 pr-4 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">{children}</tbody>
      </table>
    </div>
  );
}

export function ReleaseMeta({
  size,
  publishedAt,
  digest,
}: {
  size: number;
  publishedAt: string | null;
  digest: string | null;
}) {
  return (
    <div className="text-xs text-zinc-400">
      <p>{formatFileSize(size) ?? '–'}</p>
      <p>{formatDateTime(publishedAt) ?? '–'}</p>
      {digest ? (
        <p className="font-mono text-[10px] text-zinc-500" title={digest}>
          {digest.slice(0, 16)}…
        </p>
      ) : (
        <p className="text-zinc-600">Kein Digest</p>
      )}
    </div>
  );
}
