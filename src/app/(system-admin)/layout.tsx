import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
import AccessDenied from '@/components/dashboard/AccessDenied';
import {
  ShieldIcon,
  BookIcon,
  HomeIcon,
  UserIcon,
} from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Systemverwaltung',
  robots: { index: false, follow: false },
};

// The layout checks the session and role on every request, so these routes have
// no static shell and are allowed to block on that lookup.
export const instant = false;

// Only routes that actually exist are linked. Database/system settings would
// need their own reviewed implementation before they can be advertised.
const SYSTEM_ADMIN_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: 'Übersicht',
    href: '/system-admin',
    icon: <HomeIcon className="h-5 w-5" />,
    exact: true,
  },
  {
    label: 'Administration',
    href: '/admin',
    icon: <UserIcon className="h-5 w-5" />,
  },
  {
    label: 'Audit-Protokoll',
    href: '/admin/audit',
    icon: <BookIcon className="h-5 w-5" />,
  },
];

export default async function SystemAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/system-admin');
  }

  if (session.user.role !== 'SYSTEM_ADMIN') {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <Header />
        <main id="main-content" className="flex-1">
          <AccessDenied area="Die Systemverwaltung" requiredRole="Systemadministrator" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header />

      <div className="border-b border-rose-950/60 bg-rose-950/30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400">
              Systemverwaltung
            </span>
            <span className="text-xs text-rose-300">
              Nur für Systemadministratoren
            </span>
          </div>
          <ShieldIcon className="h-4 w-4 text-rose-300" aria-hidden="true" />
        </div>
      </div>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <DashboardBreadcrumbs rootLabel="Systemverwaltung" rootHref="/system-admin" />
        <div className="flex flex-col gap-8 lg:flex-row">
          <DashboardNav
            items={SYSTEM_ADMIN_NAV_ITEMS}
            ariaLabel="Systemverwaltung-Navigation"
            heading="Systemverwaltung"
            mobileLabel="Systemmenü"
            tone="rose"
          />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
