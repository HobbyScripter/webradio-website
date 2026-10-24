'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRightIcon } from '@/components/ui/icons';

export type DashboardNavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Only mark active on an exact path match (used for section overviews). */
  exact?: boolean;
};

type Tone = 'violet' | 'rose';

const TONE_CLASSES: Record<Tone, { heading: string; active: string }> = {
  violet: {
    heading: 'text-violet-400/80',
    active: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
  },
  rose: {
    heading: 'text-rose-400/80',
    active: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  },
};

function isActivePath(pathname: string, item: DashboardNavItem): boolean {
  if (item.exact) {
    return pathname === item.href || pathname === `${item.href}/`;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Responsive dashboard navigation.
 *
 * Desktop renders a sticky sidebar; below `lg` the same items live in a native
 * disclosure (`<details>`), which is keyboard operable without extra script
 * state. The active entry comes from `usePathname()` instead of a hardcoded
 * path, so nested pages highlight the right section.
 */
export default function DashboardNav({
  items,
  ariaLabel,
  heading,
  tone = 'violet',
  footer,
  mobileLabel = 'Bereichsnavigation',
}: {
  items: readonly DashboardNavItem[];
  ariaLabel: string;
  heading: string;
  tone?: Tone;
  footer?: ReactNode;
  mobileLabel?: string;
}) {
  const pathname = usePathname() ?? '';
  const classes = TONE_CLASSES[tone];

  const list = (showIcons: boolean) => (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isActivePath(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                active
                  ? classes.active
                  : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {showIcons && item.icon ? item.icon : null}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="lg:w-64 lg:shrink-0">
      {/* Mobile / tablet disclosure */}
      <details className="group mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          <span>{mobileLabel}</span>
          <ChevronRightIcon className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-zinc-800 px-3 py-3">
          <p className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wider ${classes.heading}`}>
            {heading}
          </p>
          {list(true)}
          {footer ? <div className="mt-3 border-t border-zinc-800 pt-3">{footer}</div> : null}
        </div>
      </details>

      {/* Desktop sidebar */}
      <nav aria-label={ariaLabel} className="hidden lg:block">
        <div className="sticky top-24">
          <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${classes.heading}`}>
            {heading}
          </p>
          {list(true)}
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
      </nav>
    </div>
  );
}
