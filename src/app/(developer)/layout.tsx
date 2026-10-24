import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/auth-service';
import { db } from '@/lib/db';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import Link from 'next/link';
import {
  CodeIcon,
  PlugIcon,
  PaletteIcon,
  CalendarIcon,
  UserIcon,
  BookIcon,
  ChevronRightIcon,
  HomeIcon,
} from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Entwicklerbereich',
  robots: { index: false, follow: false },
};

// The layout checks the session and role on every request, so developer routes
// have no static shell and are allowed to block on that lookup.
export const instant = false;

// Developer navigation items
type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
};

const DEV_NAV_MAIN: NavItem[] = [
  { 
    label: 'Übersicht', 
    href: '/developer', 
    icon: <HomeIcon className="h-5 w-5" />,
    match: (path: string) => path === '/developer' || path === '/developer/',
  },
  {
    label: 'Plugins',
    href: '/developer/plugins',
    icon: <PlugIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/developer/plugins'),
  },
  {
    label: 'Themes',
    href: '/developer/themes',
    icon: <PaletteIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/developer/themes'),
  },
  {
    label: 'Einreichungen',
    href: '/developer/submissions',
    icon: <CalendarIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/developer/submissions'),
  },
];

const DEV_NAV_ACCOUNT: NavItem[] = [
  {
    label: 'Mein Profil',
    href: '/developer/profile',
    icon: <UserIcon className="h-5 w-5" />,
    match: (path: string) => path.startsWith('/developer/profile'),
  },
  {
    label: 'Dokumentation',
    href: '/docs#website-katalog',
    icon: <BookIcon className="h-5 w-5" />,
    match: (path: string) => path === '/docs#website-katalog',
  },
];

function DeveloperSidebar({ currentPath, hasProfile }: { currentPath: string; hasProfile: boolean }) {
  const navItems: NavItem[] = [...DEV_NAV_MAIN];
  
  // Only show profile link if user has a developer profile
  if (hasProfile) {
    navItems.push(...DEV_NAV_ACCOUNT);
  }

  return (
    <nav aria-label="Entwickler-Navigation" className="w-64 shrink-0 pr-8">
      <div className="sticky top-24">
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Entwicklerportal
          </h2>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = item.match(currentPath);
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
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

        {!hasProfile && (
          <div className="mt-6 p-4 rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800">
            <Link
              href="/developer/profile/create"
              className="flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              <UserIcon className="h-4 w-4" />
              Entwicklerprofil erstellen
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            <p className="text-xs text-zinc-500 mt-2">
              Erstelle ein Profil, um Plugins und Themes einzureichen
            </p>
          </div>
        )}
      </div>
    </nav>
  );
}

export default async function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/developer');
  }

  if (!hasRole(session.user.role, 'DEVELOPER')) {
    redirect('/');
  }

  // Check if user has developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: session.user.id,
  }).first();

  const hasProfile = !!profile;


  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      
      {/* Developer Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Developer Portal
            </span>
            <span className="text-xs text-zinc-400">
              Verwalte deine Plugins, Themes & Einreichungen
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/developer"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Übersicht
            </Link>
            <Link
              href="/docs#website-katalog"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              Katalogregeln
            </Link>
          </div>
        </div>
      </div>

      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex gap-8">
          <DeveloperSidebar currentPath="/developer" hasProfile={hasProfile} />
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
