'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const EXCLUDED_PREFIXES = ['/admin', '/auth', '/api', '/account'] as const;

function isOptedOut(): boolean {
  const navigatorWithGpc = navigator as Navigator & { globalPrivacyControl?: boolean };
  return navigatorWithGpc.doNotTrack === '1' || navigatorWithGpc.globalPrivacyControl === true;
}

/**
 * Sends one anonymous page-view beacon per navigation.
 *
 * - no cookies, storage or identifiers
 * - only the pathname and, for external referrers, their origin
 * - Do Not Track and Global Privacy Control skip the request
 * - admin, auth, account and API routes are never sent
 */
export function AnalyticsBeacon(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || isOptedOut()) return;
    if (EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return;
    }

    let referrer: string | null = null;
    if (document.referrer) {
      try {
        const origin = new URL(document.referrer).origin;
        if (origin !== window.location.origin) referrer = origin;
      } catch {
        referrer = null;
      }
    }

    const body = JSON.stringify({ path: pathname, referrer });

    try {
      if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          '/api/analytics/pageview',
          new Blob([body], { type: 'application/json' }),
        );
        return;
      }
      void fetch('/api/analytics/pageview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {
      // A failed beacon must never affect navigation.
    }
  }, [pathname]);

  return null;
}
