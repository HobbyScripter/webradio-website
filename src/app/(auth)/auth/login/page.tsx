'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

function safeCallbackUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (res?.status === 429) {
        setError('Zu viele Anmeldeversuche. Bitte warte einen Moment.');
        return;
      }

      if (res?.error) {
        setError('Ungültige Anmeldedaten. Bitte überprüfe E-Mail und Passwort.');
        return;
      }

      const session = await getSession();
      const role = session?.user?.role;
      const fallback =
        role === 'ADMIN' || role === 'SYSTEM_ADMIN'
          ? '/admin'
          : role === 'DEVELOPER'
            ? '/developer'
            : '/';

      const callbackUrl = safeCallbackUrl(
        new URLSearchParams(window.location.search).get('callbackUrl'),
      );

      router.push(callbackUrl ?? fallback);
      router.refresh();
    } catch {
      setError('Ein Fehler ist bei der Anmeldung aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">Anmelden</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Melde dich mit deinem WebRadio-Konto an
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
          >
            E-Mail-Adresse
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
              Passwort
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-[11px] font-medium text-violet-300 hover:text-violet-200"
            >
              Passwort vergessen?
            </Link>
          </div>
          <input
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? 'Wird angemeldet …' : 'Anmelden'}
        </button>
      </form>

      <div className="mt-6 space-y-2 border-t border-white/[0.07] pt-6 text-center text-xs text-zinc-400">
        <p>
          Noch kein Konto?{' '}
          <Link href="/auth/register" className="font-semibold text-violet-300 hover:text-violet-200">
            Jetzt registrieren
          </Link>
        </p>
        <p>
          E-Mail noch nicht bestätigt?{' '}
          <Link
            href="/auth/verify-email/resend"
            className="font-semibold text-zinc-300 hover:text-white"
          >
            Neuen Link anfordern
          </Link>
        </p>
      </div>
    </div>
  );
}
