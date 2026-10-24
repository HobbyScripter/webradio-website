import Link from 'next/link';
import { ShieldIcon } from '@/components/ui/icons';

/**
 * Access-denied panel for an authenticated user whose database role is below
 * the requirement. It reveals nothing about the protected content.
 *
 * This is presentation only: every protected page, action and API still
 * enforces the same check server-side before reading or writing anything.
 */
export default function AccessDenied({
  area,
  requiredRole,
}: {
  area: string;
  requiredRole: string;
}) {
  return (
    <div
      role="alert"
      className="mx-auto my-16 max-w-md space-y-4 rounded-2xl border border-rose-900/50 bg-zinc-900 p-8 text-center"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
        <ShieldIcon className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-bold text-white">403 — Keine Berechtigung</h2>
      <p className="text-sm text-zinc-400">
        {area} ist nur für Konten mit der Rolle „{requiredRole}“ oder höher zugänglich.
      </p>
      <div className="pt-2">
        <Link
          href="/"
          className="inline-flex items-center rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
}
