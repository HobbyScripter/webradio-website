import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { db } from '@/lib/db';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import Link from 'next/link';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
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

const DEV_NAV_MAIN: DashboardNavItem[] = [
  {
    label: 'Übersicht',
    href: '/developer',
    icon: <HomeIcon className="h-5 w-5" />,
    exact: true,
  },
  {
    label: 'Plugins',
    href: '/developer/plugins',
    icon: <PlugIcon className="h-5 w-5" />,
  },
  {
    label: 'Themes',
    href: '/developer/themes',
    icon: <PaletteIcon className="h-5 w-5" />,
  },
  {
    label: 'Einreichungen',
    href: '/developer/submissions',
    icon: <CalendarIcon className="h-5 w-5" />,
  },
  {
    label: 'Mein Profil',
    href: '/developer/profile',
    icon: <UserIcon className="h-5 w-5" />,
  },
  {
    label: 'Dokumentation',
    href: '/docs#website-katalog',
    icon: <BookIcon className="h-5 w-5" />,
  },
];

export default async function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/developer');
  }

  // A signed-in user without the role gets an actionable explanation instead of
  // a dead end: developer access is a separate, admin-approved permission.
  if (!hasRole(session.user.role, 'DEVELOPER')) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <Header />
        <main id="main-content" className="flex-1">
          <div className="mx-auto my-16 max-w-lg space-y-4 rounded-2xl border border-violet-500/20 bg-zinc-900 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <CodeIcon className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-white">Entwicklerzugang erforderlich</h1>
            <p className="text-sm leading-relaxed text-zinc-400">
              Das Entwicklerportal ist eine eigene, von der Administration geprüfte
              Berechtigung. Eine Registrierung allein vergibt keine Entwicklerrechte.
            </p>
            <Link
              href="/account/developer"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            >
              Entwicklerzugang beantragen
            </Link>
            <p className="text-xs text-zinc-500">
              Alternativ: <Link href="/account" className="underline-offset-4 hover:underline">zurück zu Mein Konto</Link>
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const profile = await db.orm.public.DeveloperProfile.where({
    userId: session.user.id,
  }).first();

  const hasProfile = Boolean(profile);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header />

      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-400">
              Developer Portal
            </span>
            <span className="text-xs text-zinc-400">
              Verwalte deine Plugins, Themes &amp; Einreichungen
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/docs#website-katalog"
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
            >
              Katalogregeln
            </Link>
          </div>
        </div>
      </div>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <DashboardBreadcrumbs rootLabel="Developer" rootHref="/developer" />
        <div className="flex flex-col gap-8 lg:flex-row">
          <DashboardNav
            items={DEV_NAV_MAIN}
            ariaLabel="Entwickler-Navigation"
            heading="Entwicklerportal"
            mobileLabel="Entwickler-Menü"
            tone="violet"
            footer={
              !hasProfile ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4">
                  <Link
                    href="/developer/profile/create"
                    className="flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300"
                  >
                    <UserIcon className="h-4 w-4" />
                    Entwicklerprofil erstellen
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                  <p className="mt-2 text-xs text-zinc-500">
                    Erstelle ein Profil, um Plugins und Themes einzureichen
                  </p>
                </div>
              ) : (
                <p className="flex items-center gap-2 px-1 text-xs text-zinc-500">
                  <CodeIcon className="h-4 w-4 text-violet-400" />
                  {profile?.displayName}
                </p>
              )
            }
          />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
