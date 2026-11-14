'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/analytics', label: 'Übersicht', exact: true },
  { href: '/admin/analytics/traffic', label: 'Traffic' },
  { href: '/admin/analytics/releases', label: 'Releases' },
  { href: '/admin/analytics/downloads', label: 'Downloads' },
  { href: '/admin/analytics/repository', label: 'Repository' },
  { href: '/admin/analytics/website', label: 'Website' },
  { href: '/admin/analytics/audience', label: 'Zielgruppe' },
  { href: '/admin/analytics/sync', label: 'Synchronisierung' },
] as const;

export function AnalyticsTabs() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Analytics-Bereiche"
      className="flex flex-wrap gap-2 border-b border-white/10 pb-3"
    >
      {TABS.map((tab) => {
        const active = 'exact' in tab ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              active
                ? 'bg-violet-500/15 text-violet-200'
                : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
