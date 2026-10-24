'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SEGMENT_LABELS: Record<string, string> = {
  account: 'Mein Konto',
  profile: 'Profil',
  security: 'Sicherheit',
  developer: 'Developer',
  plugins: 'Plugins',
  themes: 'Themes',
  submissions: 'Einreichungen',
  versions: 'Versionen',
  create: 'Neu',
  edit: 'Bearbeiten',
  admin: 'Administration',
  users: 'Benutzer',
  moderation: 'Moderation',
  news: 'News',
  audit: 'Audit-Protokoll',
  'system-admin': 'Systemverwaltung',
  database: 'Datenbank',
  settings: 'System',
  PLUGIN: 'Plugin',
  THEME: 'Theme',
};

const HIDDEN_SEGMENTS = new Set(['versions']);

function labelFor(segment: string): string {
  if (SEGMENT_LABELS[segment]) {
    return SEGMENT_LABELS[segment];
  }
  // Slugs and opaque ids are not meaningful navigation labels.
  if (/^[0-9a-f-]{8,}$/i.test(segment) || segment.length > 32) {
    return 'Detail';
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Breadcrumb trail for dashboard pages.
 *
 * `rootLabel`/`rootHref` describe the section entry (for example
 * "Developer" → `/developer`). Segments deeper than the root become links, the
 * last one is the current page.
 */
export default function DashboardBreadcrumbs({
  rootLabel,
  rootHref,
}: {
  rootLabel: string;
  rootHref: string;
}) {
  const pathname = usePathname() ?? rootHref;
  const relative = pathname.startsWith(rootHref)
    ? pathname.slice(rootHref.length)
    : pathname;

  const segments = relative.split('/').filter(Boolean);

  const trail: { label: string; href: string }[] = [{ label: rootLabel, href: rootHref }];
  let accumulated = rootHref;

  for (const segment of segments) {
    accumulated = `${accumulated}/${segment}`;
    if (HIDDEN_SEGMENTS.has(segment)) {
      continue;
    }
    trail.push({ label: labelFor(segment), href: accumulated });
  }

  return (
    <nav aria-label="Brotkrümelnavigation" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${item.href}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-zinc-700">
                  /
                </span>
              ) : null}
              {isLast ? (
                <span aria-current="page" className="font-medium text-zinc-300">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="rounded transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
