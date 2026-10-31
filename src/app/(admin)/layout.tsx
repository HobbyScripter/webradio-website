import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
import AccessDenied from '@/components/dashboard/AccessDenied';
import {
  UserIcon,
  NewsIcon,
  ClockIcon,
  BookIcon,
  HomeIcon,
  ShieldIcon,
  AlertIcon,
} from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};

// The layout checks the session and role on every request, so admin routes have
// no static shell and are allowed to block on that lookup.
export const instant = false;

const ADMIN_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: <HomeIcon className="h-5 w-5" />,
    exact: true,
  },
  {
    label: 'Benutzer',
    href: '/admin/users',
    icon: <UserIcon className="h-5 w-5" />,
  },
  {
    label: 'Moderation',
    href: '/admin/moderation',
    icon: <ClockIcon className="h-5 w-5" />,
  },
  {
    label: 'Meldungen',
    href: '/admin/reports',
    icon: <AlertIcon className="h-5 w-5" />,
  },
  {
    label: 'Entwickleranträge',
    href: '/admin/developer-applications',
    icon: <UserIcon className="h-5 w-5" />,
  },
  {
    label: 'News',
    href: '/admin/news',
    icon: <NewsIcon className="h-5 w-5" />,
  },
  {
    label: 'Rechtliche Inhalte',
    href: '/admin/legal',
    icon: <BookIcon className="h-5 w-5" />,
  },
  {
    label: 'Audit-Protokoll',
    href: '/admin/audit',
    icon: <BookIcon className="h-5 w-5" />,
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/admin');
  }

  if (!hasRole(session.user.role, 'ADMIN')) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <Header />
        <main id="main-content" className="flex-1">
          <AccessDenied area="Die Administration" requiredRole="Administrator" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header />

      <div className="border-b border-rose-950/60 bg-rose-950/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400">
              Administrationsbereich
            </span>
            <span className="text-xs text-rose-300">
              Nur für autorisierte Administratoren
            </span>
          </div>
          {session.user.role === 'SYSTEM_ADMIN' ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-rose-200">
              <ShieldIcon className="h-4 w-4" />
              Systemadministrator
            </span>
          ) : null}
        </div>
      </div>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <DashboardBreadcrumbs rootLabel="Administration" rootHref="/admin" />
        <div className="flex flex-col gap-8 lg:flex-row">
          <DashboardNav
            items={ADMIN_NAV_ITEMS}
            ariaLabel="Admin-Navigation"
            heading="Administration"
            mobileLabel="Admin-Menü"
            tone="rose"
          />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
