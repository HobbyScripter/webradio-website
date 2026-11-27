import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import Header from '@/components/public/Header';
import Footer from '@/components/public/Footer';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
import AccessDenied from '@/components/dashboard/AccessDenied';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { DEFAULT_LOCALE, parseLocale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
import {
  UserIcon,
  NewsIcon,
  ClockIcon,
  BookIcon,
  HomeIcon,
  ShieldIcon,
  AlertIcon,
  DownloadIcon,
  GitHubIcon,
  RadioIcon,
  LayersIcon,
  GlobeIcon,
  SettingsIcon,
} from '@/components/ui/icons';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  return {
    title: t('meta.adminTitle'),
    robots: { index: false, follow: false },
  };
}

// The layout checks the session and role on every request, so admin routes have
// no static shell and are allowed to block on that lookup.
export const instant = false;

export default async function AdminLayout({ children, params }: LayoutProps) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect(`/${locale}/auth/login?callbackUrl=/${locale}/admin`);
  }

  if (!hasRole(session.user.role, 'ADMIN')) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <Header locale={locale} />
        <main id="main-content" className="flex-1">
          <AccessDenied
            area={t('admin.accessDeniedArea')}
            requiredRole={t('admin.accessDeniedRole')}
          />
        </main>
        <Footer locale={locale} />
      </div>
    );
  }

  const adminNavItems: DashboardNavItem[] = [
    { label: t('admin.navDashboard'), href: '/admin', icon: <HomeIcon className="h-5 w-5" />, exact: true },
    { label: t('admin.navUsers'), href: '/admin/users', icon: <UserIcon className="h-5 w-5" /> },
    { label: t('admin.navModeration'), href: '/admin/moderation', icon: <ClockIcon className="h-5 w-5" /> },
    { label: t('admin.navReports'), href: '/admin/reports', icon: <AlertIcon className="h-5 w-5" /> },
    {
      label: t('admin.navDeveloperApplications'),
      href: '/admin/developer-applications',
      icon: <UserIcon className="h-5 w-5" />,
    },
    { label: t('admin.navNews'), href: '/admin/news', icon: <NewsIcon className="h-5 w-5" /> },
    { label: t('admin.navLegal'), href: '/admin/legal', icon: <BookIcon className="h-5 w-5" /> },
    { label: t('admin.navAnalytics'), href: '/admin/analytics', icon: <RadioIcon className="h-5 w-5" /> },
    { label: t('admin.navAdvertising'), href: '/admin/advertising', icon: <LayersIcon className="h-5 w-5" /> },
    { label: t('admin.navPartners'), href: '/admin/partners', icon: <GlobeIcon className="h-5 w-5" /> },
    { label: t('admin.navDownloads'), href: '/admin/downloads', icon: <DownloadIcon className="h-5 w-5" /> },
    {
      label: t('admin.navGithub'),
      href: '/admin/settings/integrations/github',
      icon: <GitHubIcon className="h-5 w-5" />,
    },
    {
      label: t('admin.navTranslations'),
      href: '/admin/translations',
      icon: <SettingsIcon className="h-5 w-5" />,
    },
    { label: t('admin.navAudit'), href: '/admin/audit', icon: <BookIcon className="h-5 w-5" /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header locale={locale} />

      <div className="border-b border-rose-950/60 bg-rose-950/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400">
              {t('admin.area')}
            </span>
            <span className="text-xs text-rose-300">{t('admin.authorizedOnly')}</span>
          </div>
          {session.user.role === 'SYSTEM_ADMIN' ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-rose-200">
              <ShieldIcon className="h-4 w-4" />
              {t('admin.systemAdmin')}
            </span>
          ) : null}
        </div>
      </div>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <DashboardBreadcrumbs rootLabel={t('admin.navHeading')} rootHref="/admin" />
        <div className="flex flex-col gap-8 lg:flex-row">
          <DashboardNav
            items={adminNavItems}
            ariaLabel={t('admin.nav')}
            heading={t('admin.navHeading')}
            mobileLabel={t('admin.navMenuLabel')}
            tone="rose"
            footer={<LanguageSelector variant="footer" />}
          />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
