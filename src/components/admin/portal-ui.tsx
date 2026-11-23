import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { statusLabel, type StatusTone } from '@/lib/advertising/labels';

/** Shared input styling of the admin portal. */
export const fieldClass =
  'w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20';

export function Panel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 ${className}`}
    >
      {title || action ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-white">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{description}</p>
            ) : null}
          </div>
          {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  value,
  label,
  hint,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-zinc-400">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-zinc-500">{hint}</div> : null}
    </div>
  );
}

/** Scroll container so no column or action is ever cut off on small screens. */
export function TableShell({
  children,
  caption,
  minWidth = 'min-w-[44rem]',
}: {
  children: ReactNode;
  caption: string;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
      <table className={`w-full ${minWidth} text-sm`}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-zinc-800 bg-zinc-800/50">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 align-top ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-zinc-400">
        {children}
      </td>
    </tr>
  );
}

export function StatusBadge({
  map,
  status,
}: {
  map: Record<string, { label: string; tone: StatusTone }>;
  status: string;
}) {
  const entry = statusLabel(map, status);
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className = '',
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-[11px] text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
}) {
  const classes =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200'
      : tone === 'error'
        ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-200'
        : 'border-sky-500/20 bg-sky-500/[0.06] text-sky-200';

  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${classes}`}
    >
      {children}
    </p>
  );
}

/** Two-column form grid that collapses on mobile. */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export const smallButtonClass =
  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50';
