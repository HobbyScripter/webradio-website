'use client';

/**
 * Locale-aware navigation primitives.
 *
 * Every internal `href` in the platform goes through this module, so a link can
 * never silently drop the visitor into another language:
 *
 *   <Link href="/plugins">  ->  /de/plugins, /en/plugins, …
 *
 * `usePathname()` here returns the path *without* the locale prefix, which is
 * what active-link checks compare against (the navigation tables stay
 * locale-free). External URLs, `mailto:` and pure fragments pass through
 * untouched, and an already-prefixed path keeps exactly one prefix.
 */
import NextLink from 'next/link';
import { usePathname as useNextPathname } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { localizePath, stripLocale, type Locale } from './config';
import { useLocale } from './provider';

export type LocalizedHref = ComponentProps<typeof NextLink>['href'];

/** True for anything that must not receive a locale prefix. */
export function isExternalHref(href: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(href) || // https:, mailto:, tel:, data:
    href.startsWith('//') ||
    href.startsWith('#')
  );
}

/**
 * Prefix an href with a locale. Non-string hrefs (the object form of
 * `next/link`) are returned unchanged: they are built by the caller, which
 * already knows the locale.
 */
export function localizeHref(locale: Locale, href: LocalizedHref): LocalizedHref {
  if (typeof href !== 'string' || isExternalHref(href)) {
    return href;
  }

  // Split off a query string and hash so `/plugins?q=x` -> `/de/plugins?q=x`.
  const match = /^([^?#]*)([?#].*)?$/.exec(href);
  const path = match?.[1] ?? href;
  const suffix = match?.[2] ?? '';

  if (!path) {
    return href;
  }

  return `${localizePath(locale, path)}${suffix}`;
}

/**
 * Internal link that keeps the current locale.
 *
 * `locale` and `href` may be overridden explicitly, which the language
 * selector uses to point at the same page in another language.
 */
export default function Link({
  href,
  locale: explicitLocale,
  prefetch,
  ...rest
}: ComponentProps<typeof NextLink> & { locale?: Locale }) {
  const activeLocale = useLocale();
  const locale = explicitLocale ?? activeLocale;

  return <NextLink href={localizeHref(locale, href)} prefetch={prefetch} {...rest} />;
}

/** The current path without its locale prefix (`/de/plugins` -> `/plugins`). */
export function usePathname(): string {
  return stripLocale(useNextPathname() ?? '/');
}

/**
 * Click handler helper for anchors that must keep the locale but are rendered
 * as plain `<a>` (for example a download link with `download`).
 */
export function useLocalizedHref() {
  const locale = useLocale();
  return (href: string) => localizeHref(locale, href) as string;
}

/** Prevent the browser's default action, e.g. before a client-side update. */
export function preventDefault(event: MouseEvent): void {
  event.preventDefault();
}
