import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { getAccountNavItems, type AccountNavIcon } from '@/lib/roles';
import DashboardNav, { type DashboardNavItem } from '@/components/dashboard/DashboardNav';
import DashboardBreadcrumbs from '@/components/dashboard/DashboardBreadcrumbs';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { DEFAULT_LOCALE, parseLocale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
import {
  UserIcon,
  SettingsIcon,
  ShieldIcon,
  CodeIcon,
  ServerIcon,
} from '@/components/ui/icons';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  return {
    title: t('account.navTitle'),
    robots: { index: false, follow: false },
  };
}

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
export default async function AccountSectionLayout({ children, params }: LayoutProps) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);

  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect(`/${locale}/auth/login?callbackUrl=/${locale}/account`);
  }

  const navItems: DashboardNavItem[] = getAccountNavItems(session.user.role).map((item) => ({
    label: t(item.labelKey),
    href: item.href,
    icon: iconFor(item.icon),
    exact: item.href === '/account',
  }));

  return (
    <div>
      <DashboardBreadcrumbs rootLabel={t('account.navTitle')} rootHref="/account" />
      <div className="flex flex-col gap-8 lg:flex-row">
        <DashboardNav
          items={navItems}
          ariaLabel={t('account.navAria')}
          heading={t('account.navTitle')}
          mobileLabel={t('account.navMenuLabel')}
          tone="violet"
          footer={<LanguageSelector variant="footer" />}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
