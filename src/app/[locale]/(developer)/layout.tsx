import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { db } from '@/lib/db';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import Link from '@/i18n/navigation';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { DEFAULT_LOCALE, parseLocale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
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

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  return {
    title: t('meta.developerTitle'),
    robots: { index: false, follow: false },
  };
}

// The layout checks the session and role on every request, so developer routes
// have no static shell and are allowed to block on that lookup.
export const instant = false;

export default async function DeveloperLayout({ children, params }: LayoutProps) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect(`/${locale}/auth/login?callbackUrl=/${locale}/developer`);
  }

  // A signed-in user without the role gets an actionable explanation instead of
  // a dead end: developer access is a separate, admin-approved permission.
  if (!hasRole(session.user.role, 'DEVELOPER')) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <Header locale={locale} />
        <main id="main-content" className="flex-1">
          <div className="mx-auto my-16 max-w-lg space-y-4 rounded-2xl border border-violet-500/20 bg-zinc-900 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <CodeIcon className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-white">{t('developer.accessRequired')}</h1>
            <p className="text-sm leading-relaxed text-zinc-400">
              {t('developer.accessRequiredBody')}
            </p>
            <Link
              href="/account/developer"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            >
              {t('developer.requestAccess')}
            </Link>
            <p className="text-xs text-zinc-500">
              <Link href="/account" className="underline-offset-4 hover:underline">
                {t('developer.backToAccount')}
              </Link>
            </p>
          </div>
        </main>
        <Footer locale={locale} />
      </div>
    );
  }

  const profile = await db.orm.public.DeveloperProfile.where({
    userId: session.user.id,
  }).first();

  const hasProfile = Boolean(profile);

  const devNavItems: DashboardNavItem[] = [
    { label: t('developer.navOverview'), href: '/developer', icon: <HomeIcon className="h-5 w-5" />, exact: true },
    { label: t('developer.navPlugins'), href: '/developer/plugins', icon: <PlugIcon className="h-5 w-5" /> },
    { label: t('developer.navThemes'), href: '/developer/themes', icon: <PaletteIcon className="h-5 w-5" /> },
    {
      label: t('developer.navSubmissions'),
      href: '/developer/submissions',
      icon: <CalendarIcon className="h-5 w-5" />,
    },
    { label: t('developer.navProfile'), href: '/developer/profile', icon: <UserIcon className="h-5 w-5" /> },
    { label: t('developer.navDocs'), href: '/docs#website-katalog', icon: <BookIcon className="h-5 w-5" /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header locale={locale} />

      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-400">
              {t('developer.portal')}
            </span>
            <span className="text-xs text-zinc-400">{t('developer.portalSubtitle')}</span>
          </div>
          <Link
            href="/docs#website-katalog"
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
          >
            {t('developer.catalogRules')}
          </Link>
        </div>
      </div>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <DashboardBreadcrumbs rootLabel={t('developer.area')} rootHref="/developer" />
        <div className="flex flex-col gap-8 lg:flex-row">
          <DashboardNav
            items={devNavItems}
            ariaLabel={t('developer.nav')}
            heading={t('developer.navHeading')}
            mobileLabel={t('developer.navMenuLabel')}
            tone="violet"
            footer={
              <div className="space-y-3">
                {!hasProfile ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4">
                    <Link
                      href="/developer/profile/create"
                      className="flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300"
                    >
                      <UserIcon className="h-4 w-4" />
                      {t('developer.profileCreate')}
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                    <p className="mt-2 text-xs text-zinc-500">{t('developer.profileCreateHint')}</p>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 px-1 text-xs text-zinc-500">
                    <CodeIcon className="h-4 w-4 text-violet-400" />
                    {profile?.displayName}
                  </p>
                )}
                <LanguageSelector variant="footer" />
              </div>
            }
          />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
