import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import Link from 'next/link';
import {
  ShieldIcon,
  UserIcon,
  DatabaseIcon,
  SettingsIcon,
  HomeIcon,
} from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Systemverwaltung',
  robots: { index: false, follow: false },
};

// The layout checks the session and role on every request, so these routes have
// no static shell and are allowed to block on that lookup.
export const instant = false;

// System Admin navigation items
const SYSTEM_ADMIN_NAV_ITEMS = [
  { 
    label: 'Dashboard', 
    href: '/system-admin', 
    icon: <HomeIcon className="h-5 w-5" />,
    match: (path: string) => path === '/system-admin',
  },
  {
    label: 'Benutzer',
    href: '/system-admin/users',
    icon: <UserIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/system-admin/users'),
  },
  {
    label: 'Datenbank',
    href: '/system-admin/database',
    icon: <DatabaseIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/system-admin/database'),
  },
  {
    label: 'System',
    href: '/system-admin/settings',
    icon: <SettingsIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/system-admin/settings'),
  },
] as const;

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
};

function SystemAdminSidebar({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Systemverwaltung-Navigation" className="w-64 shrink-0 pr-8">
      <div className="sticky top-24">
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Systemverwaltung
          </h2>
          <ul className="space-y-1">
            {SYSTEM_ADMIN_NAV_ITEMS.map((item) => {
              const isActive = item.match(currentPath);
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}

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
    redirect('/');
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      
      {/* System Admin Header */}
      <div className="border-b border-rose-950/60 bg-rose-950/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Systemverwaltung
            </span>
            <span className="text-xs text-rose-300">
              Nur für Systemadministratoren
            </span>
          </div>
        </div>
      </div>

      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex gap-8">
          <SystemAdminSidebar currentPath="/system-admin" />
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// Export for use in nested layouts
export { SystemAdminSidebar, SYSTEM_ADMIN_NAV_ITEMS };
