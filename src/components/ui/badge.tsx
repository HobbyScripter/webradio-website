import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'beta';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-white/10 bg-white/[0.05] text-zinc-300',
  accent: 'border-violet-400/25 bg-violet-500/10 text-violet-300',
  success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
  danger: 'border-rose-400/25 bg-rose-500/10 text-rose-300',
  beta: 'border-sky-400/25 bg-sky-500/10 text-sky-300',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
