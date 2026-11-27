import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'Seite nicht gefunden',
  robots: { index: false, follow: false },
};

export const instant = false;

/**
 * Public `/404` page for direct requests.
 *
 * Unknown plugin/theme/news slugs no longer rewrite here: the proxy answers
 * them directly with a `no-store` 404 so no framework or CDN cache directive
 * can keep a negative answer alive. `headers()` still keeps this route out of
 * the static shell and gives it the same per-request cache policy.
 */
export default async function NotFoundRoute() {
  await headers();

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-xl text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-violet-300">404</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Seite nicht gefunden
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-400">
          Dieser Eintrag existiert nicht, wurde zurückgezogen oder ist noch nicht freigegeben.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/plugins">Plugins entdecken</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Zur Startseite
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
