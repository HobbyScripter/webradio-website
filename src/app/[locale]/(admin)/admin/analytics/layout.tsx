import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { AnalyticsTabs } from './analytics-tabs';

export const metadata: Metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false },
};

export const instant = false;

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  if (!session?.user || !hasRole(session.user.role, 'ADMIN')) {
    redirect('/auth/login?callbackUrl=/admin/analytics');
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
          Statistik & Auswertung
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-400">
          GitHub-Traffic, Releases, Repository-Statistiken und anonyme Website-Daten –
          strikt getrennt, ohne Doppelzählung.
        </p>
      </header>
      <AnalyticsTabs />
      {children}
    </div>
  );
}
