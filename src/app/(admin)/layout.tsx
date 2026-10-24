import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/auth-service';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import Link from 'next/link';
import {
  ShieldIcon,
  UserIcon,
  PlugIcon,
  PaletteIcon,
  NewsIcon,
  ClockIcon,
  BookIcon,
  HomeIcon,
} from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};

// The layout checks the session and role on every request, so admin routes have
// no static shell and are allowed to block on that lookup.
export const instant = false;

// Admin navigation items
type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
};

const ADMIN_NAV_ITEMS: NavItem[] = [
  { 
    label: 'Dashboard', 
    href: '/admin', 
    icon: <HomeIcon className="h-5 w-5" />,
    match: (path: string) => path === '/admin' || path === '/admin/',
  },
  {
    label: 'Benutzer',
    href: '/admin/users',
    icon: <UserIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/admin/users'),
  },
  {
    label: 'Moderation',
    href: '/admin/moderation',
    icon: <ClockIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/admin/moderation'),
  },
  {
    label: 'News',
    href: '/admin/news',
    icon: <NewsIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/admin/news'),
  },
  {
    label: 'Audit-Log',
    href: '/admin/audit',
    icon: <BookIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/admin/audit'),
  },
];

function AdminSidebar({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Admin-Navigation" className="w-64 shrink-0 pr-8">
      <div className="sticky top-24">
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-500/80 mb-3">
            Administration
          </h2>
          <ul className="space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => {
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
    redirect('/');
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      
      {/* Admin Header */}
      <div className="border-b border-rose-950/60 bg-rose-950/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Administrationsbereich
            </span>
            <span className="text-xs text-rose-300">
              Nur für autorisierte Administratoren
            </span>
          </div>
        </div>
      </div>

      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex gap-8">
          <AdminSidebar currentPath="/admin" />
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
