import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from '@/i18n/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasPublishedNews } from '@/lib/catalog';
import { createServerI18n } from '@/i18n/server';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import Brand from './Brand';
import MobileMenu from './MobileMenu';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { ButtonLink } from '@/components/ui/button';
import { GitHubIcon } from '@/components/ui/icons';
import { PRODUCT_REPOSITORY_URL } from '@/lib/site';
import { getPublicCustomLinks, type PublicCustomLink } from '@/lib/custom-links/service';
import AccountDropdown from './AccountDropdown';

type NavItem = {
  labelKey?: string;
  label?: string;
  href: string;
  disabled?: boolean;
  custom?: boolean;
  external?: boolean;
  openInNewTab?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.plugins', href: '/plugins' },
  { labelKey: 'nav.themes', href: '/themes' },
  { labelKey: 'nav.releases', href: '/releases' },
  { labelKey: 'nav.docs', href: '/docs' },
];

const NEWS_ITEM: NavItem = { labelKey: 'nav.news', href: '/news' };

/**
 * "News" only appears once at least one article is published and dated.
 * The check runs on the server, so an empty news section is not advertised in
 * the navigation at all.
 */
async function visibleNavItems(): Promise<NavItem[]> {
  try {
    const hasNews = await hasPublishedNews();
    return hasNews ? [...NAV_ITEMS, NEWS_ITEM] : NAV_ITEMS;
  } catch {
    return NAV_ITEMS;
  }
}

async function getCustomNavItems(locale: Locale): Promise<NavItem[]> {
  try {
    const links = await getPublicCustomLinks('MAIN_NAVIGATION', locale);
    return links.map((link: PublicCustomLink) => ({
      label: link.label,
      href: link.url,
      custom: true,
      external: link.type === 'EXTERNAL',
      openInNewTab: link.openInNewTab,
    }));
  } catch {
    // Editorial navigation is optional; the built-in navigation always renders.
    return [];
  }
}

type Translator = ReturnType<typeof createServerI18n>['t'];

async function MainNav({ t, locale }: { t: Translator; locale: Locale }) {
  await connection();
  const items = await visibleNavItems();
  const customItems = await getCustomNavItems(locale);

  return (
    <nav aria-label={t('nav.main')} className="hidden items-center gap-1 md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          {item.labelKey ? t(item.labelKey) : item.label}
        </Link>
      ))}
      {customItems.map((item) => (
        item.external ? (
          <a
            key={item.href}
            href={item.href}
            target={item.openInNewTab ? '_blank' : undefined}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            {item.labelKey ? t(item.labelKey) : item.label}
          </a>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            {item.labelKey ? t(item.labelKey) : item.label}
          </Link>
        )
      ))}
    </nav>
  );
}

/** Signed-out controls, used for anonymous visitors. */
function SignedOutControls({ t }: { t: Translator }) {
  return (
    <>
      <ButtonLink href="/developer" variant="ghost" size="sm">
        {t('header.developer')}
      </ButtonLink>
      <ButtonLink href="/auth/register" variant="ghost" size="sm">
        {t('header.register')}
      </ButtonLink>
      <ButtonLink href="/auth/login" size="sm">
        {t('header.login')}
      </ButtonLink>
    </>
  );
}

/**
 * Auth controls wrapped in Suspense to allow prerendering of the static header.
 * This component reads the session at request time and renders the appropriate
 * controls (signed-in account dropdown or signed-out login/register buttons).
 */
async function AuthControls({ t }: { t: Translator }) {
  // next-auth derives a CSRF token from crypto randomness on every session
  // read, which is only allowed at request time. `connection()` marks the
  // render as dynamic so that value is never produced during prerendering.
  await connection();
  const session = await getServerAuthSession();
  const isAuthenticated = Boolean(session?.user);

  return (
    <>
      {isAuthenticated ? (
        <AccountDropdown
          email={session?.user.email ?? ''}
          role={session?.user.role ?? 'USER'}
        />
      ) : (
        <SignedOutControls t={t} />
      )}
    </>
  );
}

/**
 * Mobile menu wrapped in Suspense to allow prerendering of the static header.
 */
async function AuthMobileMenu({ locale }: { locale: Locale }) {
  await connection();
  const [session, items, customLinks] = await Promise.all([
    getServerAuthSession(),
    visibleNavItems(),
    getCustomNavItems(locale),
  ]);
  const isAuthenticated = Boolean(session?.user);

  return (
    <MobileMenu
      items={items}
      customLinks={customLinks}
      isAuthenticated={isAuthenticated}
      userEmail={session?.user.email ?? ''}
      userRole={session?.user.role ?? 'USER'}
      locale={locale}
    />
  );
}

/**
 * Server Component.
 *
 * The header is split into static (logo, navigation, GitHub link, language
 * selector) and dynamic (auth controls, mobile menu) parts. The dynamic parts
 * are wrapped in Suspense boundaries to allow prerendering of the static part
 * while auth state is resolved at request time. This keeps public pages fast to
 * load while showing correct auth controls for authenticated users.
 */
export default function Header({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const { t } = createServerI18n(locale);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#07070a]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[#07070a]/70">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7">
          <Brand locale={locale} />
          <Suspense fallback={<nav aria-label={t('nav.main')} className="hidden md:block" />}>
            <MainNav t={t} locale={locale} />
          </Suspense>
        </div>

        {/* Desktop Navigation - Right Side */}
        <div className="hidden items-center gap-2 md:flex">
          <LanguageSelector variant="header" showLabel={false} />

          <a
            href={PRODUCT_REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('header.githubAria')}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <GitHubIcon className="h-[18px] w-[18px]" />
          </a>

          <Suspense
            fallback={
              <div className="flex gap-2">
                <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
              </div>
            }
          >
            <AuthControls t={t} />
          </Suspense>
        </div>

        {/* Mobile Menu */}
        <Suspense
          fallback={<div className="h-10 w-10 animate-pulse rounded-lg bg-white/[0.06]" />}
        >
          <AuthMobileMenu locale={locale} />
        </Suspense>
      </div>
    </header>
  );
}
