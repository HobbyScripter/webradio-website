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
 * Server Component.
 *
 * The session is resolved once, before the header is sent, and the resulting
 * controls are rendered inline. Deferring them into a Suspense boundary kept
 * the fallback on screen for signed-in visitors, so the account menu never
 * appeared. Reading the session here makes every page that renders the header
 * dynamic; that is the price of always showing the correct controls, and it
 * keeps the public pages free of a permanent loading state.
 */
export default async function Header() {
  // next-auth derives a CSRF token from crypto randomness on every session
  // read, which is only allowed at request time. `connection()` marks the
  // render as dynamic so that value is never produced during prerendering.
  await connection();
  const session = await getServerAuthSession();
  const isAuthenticated = Boolean(session?.user);

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

          {isAuthenticated ? (
            <AccountDropdown
              email={session?.user.email ?? ''}
              role={session?.user.role ?? 'USER'}
            />
          ) : (
            <SignedOutControls />
          )}
        </div>

        {/* Mobile Menu */}
        <MobileMenu
          items={NAV_ITEMS}
          isAuthenticated={isAuthenticated}
          userEmail={session?.user.email ?? ''}
          userRole={session?.user.role ?? 'USER'}
        />
      </div>
    </header>
  );
}
