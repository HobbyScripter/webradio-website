'use client';

import Link from '@/i18n/navigation';
import { usePathname } from '@/i18n/navigation';

type FooterLink = { label: string; href: string; external?: boolean; iconName?: string };
type FooterGroup = { title: string; links: readonly FooterLink[] };

const linkClass =
  'block text-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a] rounded';

function isActive(pathname: string, href: string) {
  if (!pathname) {
    return false;
  }
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Client component only for the active-page marker: the footer itself stays a
 * server component, and no navigation state is fetched to render the links.
 */
export default function FooterNav({ groups, customLinks }: { groups: readonly FooterGroup[]; customLinks?: readonly FooterLink[] }) {
  const pathname = usePathname() ?? '';

  return (
    <>
      {groups.map((group) => (
        <nav key={group.title} aria-label={group.title}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {group.title}
          </h2>
          <ul className="mt-4 space-y-2.5">
            {group.links.map((link) => {
              const active = !link.external && isActive(pathname, link.href);
              const className = `${linkClass} ${
                active ? 'font-medium text-white' : 'text-zinc-400'
              }`;

              return (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={className}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
      {customLinks && customLinks.length > 0 && (
        <nav aria-label="Custom Links">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Custom Links
          </h2>
          <ul className="mt-4 space-y-2.5">
            {customLinks.map((link) => {
              const active = !link.external && isActive(pathname, link.href);
              const className = `${linkClass} ${
                active ? 'font-medium text-white' : 'text-zinc-400'
              }`;

              return (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={className}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
