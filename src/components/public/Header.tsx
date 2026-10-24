import { Suspense } from 'react';
import { connection } from 'next/server';
import Link from 'next/link';
import { getServerAuthSession } from '@/lib/server-auth';
import Brand from './Brand';
import MobileMenu from './MobileMenu';
import { ButtonLink } from '@/components/ui/button';
import { GitHubIcon } from '@/components/ui/icons';
import { PRODUCT_REPOSITORY_URL } from '@/lib/site';
import AccountDropdown from './AccountDropdown';

const NAV_ITEMS = [
  { label: 'Plugins', href: '/plugins' },
  { label: 'Themes', href: '/themes' },
  { label: 'Releases', href: '/releases' },
  { label: 'Dokumentation', href: '/docs' },
  { label: 'Neuigkeiten', href: '/news' },
] as const;

/** Signed-out controls, used for anonymous visitors. */
function SignedOutControls() {
  return (
    <>
      <ButtonLink href="/developer" variant="ghost" size="sm">
        Entwickler
      </ButtonLink>
      <ButtonLink href="/auth/register" variant="ghost" size="sm">
        Registrieren
      </ButtonLink>
      <ButtonLink href="/auth/login" size="sm">
        Anmelden
      </ButtonLink>
    </>
  );
}

/**
 * Neutral placeholder while the session streams in.
 *
 * It deliberately does not render the signed-out buttons: a logged-in visitor
 * would otherwise see "Anmelden" for a moment on every page load. It keeps the
 * same footprint so the header does not shift when the real controls arrive.
 */
function AccountControlsPlaceholder() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.05]" />
      <div className="h-8 w-24 animate-pulse rounded-lg bg-white/[0.07]" />
    </div>
  );
}

function MobileMenuPlaceholder() {
  return (
    <div className="md:hidden" aria-hidden="true">
      <div className="h-9 w-9 animate-pulse rounded-lg bg-white/[0.05]" />
    </div>
  );
}

/**
 * Session-dependent desktop controls. Reading cookies here would otherwise make
 * every page that renders the header dynamic, so the lookup sits behind the
 * Suspense boundary in `Header` and only this subtree streams.
 */
async function HeaderAccountControls() {
  // next-auth builds a CSRF token from crypto randomness on every session read,
  // which is only allowed at request time. `connection()` marks this subtree as
  // dynamic so the random value is never produced during prerendering.
  await connection();
  const session = await getServerAuthSession();

  if (!session?.user) {
    return <SignedOutControls />;
  }

  return (
    <AccountDropdown email={session.user.email ?? ''} role={session.user.role ?? 'USER'} />
  );
}

/** Session-aware mobile menu; renders nothing account-specific while loading. */
async function HeaderMobileMenu() {
  await connection();
  const session = await getServerAuthSession();

  return (
    <MobileMenu
      items={NAV_ITEMS}
      isAuthenticated={Boolean(session?.user)}
      userEmail={session?.user.email ?? ''}
      userRole={session?.user.role ?? 'USER'}
    />
  );
}

// Server Component: the static shell renders immediately, session controls stream in.
export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#07070a]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[#07070a]/70">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7">
          <Brand />
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Desktop Navigation - Right Side */}
        <div className="hidden items-center gap-2 md:flex">
          <a
            href={PRODUCT_REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Quellcode auf GitHub (öffnet in einem neuen Tab)"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <GitHubIcon className="h-[18px] w-[18px]" />
          </a>

          <Suspense fallback={<AccountControlsPlaceholder />}>
            <HeaderAccountControls />
          </Suspense>
        </div>

        {/* Mobile Menu */}
        <Suspense fallback={<MobileMenuPlaceholder />}>
          <HeaderMobileMenu />
        </Suspense>
      </div>
    </header>
  );
}
