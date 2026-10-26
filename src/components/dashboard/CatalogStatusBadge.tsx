import type { CatalogStatus } from '@/lib/validations';

const STATUS_META: Record<CatalogStatus, { label: string; className: string }> = {
  DRAFT: {
    label: 'Entwurf',
    className: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  },
  PENDING_REVIEW: {
    label: 'In Prüfung',
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  },
  APPROVED: {
    label: 'Genehmigt',
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  },
  REJECTED: {
    label: 'Abgelehnt',
    className: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  },
  CHANGES_REQUESTED: {
    label: 'Änderungen angefordert',
    className: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
  },
  ARCHIVED: {
    label: 'Archiviert',
    className: 'border-zinc-600/30 bg-zinc-600/10 text-zinc-400',
  },
  REMOVED: {
    label: 'Entfernt',
    className: 'border-rose-600/30 bg-rose-600/10 text-rose-300',
  },
};

export function catalogStatusLabel(status: string): string {
  return STATUS_META[status as CatalogStatus]?.label ?? status;
}

export default function CatalogStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as CatalogStatus] ?? {
    label: status,
    className: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
