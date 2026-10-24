import type { ReactNode } from 'react';
import { ButtonLink } from './button';
import { AlertIcon, SearchIcon } from './icons';

export function EmptyState({
  title,
  description,
  action,
  icon,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'warning';
}) {
  const iconColor =
    tone === 'warning'
      ? 'border-amber-400/20 bg-amber-500/10 text-amber-300'
      : 'border-white/10 bg-white/[0.04] text-zinc-400';

  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
      <div
        className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border ${iconColor}`}
      >
        {icon ?? <SearchIcon className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Presentational error panel for failed server-side data reads. */
export function ErrorState({
  title = 'Inhalte konnten nicht geladen werden',
  description = 'Der Katalog ist momentan nicht erreichbar. Bitte versuche es in einem Moment erneut.',
  retryHref,
}: {
  title?: string;
  description?: string;
  retryHref?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-6 py-10 text-center"
    >
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10 text-rose-300">
        <AlertIcon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{description}</p>
      {retryHref ? (
        <div className="mt-5">
          <ButtonLink href={retryHref} variant="secondary" size="sm">
            Erneut versuchen
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

export function CatalogueSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
        />
      ))}
    </div>
  );
}
