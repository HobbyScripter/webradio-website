import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { getAccountNavItems, type AccountNavIcon } from '@/lib/roles';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
import {
  UserIcon,
  SettingsIcon,
  ShieldIcon,
  CodeIcon,
  ServerIcon,
} from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Mein Konto',
  robots: { index: false, follow: false },
};

// Account pages read the session, so there is no static shell.
export const instant = false;

function iconFor(name: AccountNavIcon) {
  switch (name) {
    case 'settings':
      return <SettingsIcon className="h-5 w-5" />;
    case 'shield':
      return <ShieldIcon className="h-5 w-5" />;
    case 'code':
      return <CodeIcon className="h-5 w-5" />;
    case 'server':
      return <ServerIcon className="h-5 w-5" />;
    default:
      return <UserIcon className="h-5 w-5" />;
  }
}

/**
 * Account section guard and navigation.
 *
 * The check runs on the server before any child page renders, so a direct URL
 * without a live session is redirected to the login page instead of showing an
 * account shell first.
 */
export default async function AccountSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/account');
  }

  const navItems: DashboardNavItem[] = getAccountNavItems(session.user.role).map((item) => ({
    label: item.label,
    href: item.href,
    icon: iconFor(item.icon),
    exact: item.href === '/account',
  }));

  return (
    <div>
      <DashboardBreadcrumbs rootLabel="Mein Konto" rootHref="/account" />
      <div className="flex flex-col gap-8 lg:flex-row">
        <DashboardNav
          items={navItems}
          ariaLabel="Konto-Navigation"
          heading="Mein Konto"
          mobileLabel="Konto-Menü"
          tone="violet"
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
