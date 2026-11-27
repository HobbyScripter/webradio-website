'use client';

import Link from '@/i18n/navigation';
import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useIsHydrated } from '@/lib/use-hydrated';
import { useI18n } from '@/i18n/provider';
import { localizePath } from '@/i18n/config';

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
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useIsHydrated();

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
        setError(t('auth.errRateLimit'));
        return;
      }

      if (res?.error) {
        setError(t('auth.errInvalid'));
        return;
      }

      const session = await getSession();
      const role = session?.user?.role;
      // Keep the language the visitor was reading when they signed in: the URI
      // prefix is an explicit choice and outranks the detected account language.
      const fallback = localizePath(
        locale,
        role === 'ADMIN' || role === 'SYSTEM_ADMIN'
          ? '/admin'
          : role === 'DEVELOPER'
            ? '/developer'
            : '/',
      );

      // The account may already carry a language from another device. Mirror it
      // into the cookie before navigating, so the redirect below lands on the
      // right locale instead of the browser's guess.
      try {
        await fetch('/api/locale/sync', { method: 'POST', cache: 'no-store' });
      } catch {
        // A failed sync must never block sign-in.
      }

      const callbackUrl = safeCallbackUrl(
        new URLSearchParams(window.location.search).get('callbackUrl'),
      );

      router.push(callbackUrl ?? fallback);
      router.refresh();
    } catch {
      setError(t('auth.errGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">{t('auth.loginTitle')}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t('auth.loginSubtitle')}</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <form method="post" action="/auth/login" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
          >
            {t('auth.email')}
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
              {t('auth.password')}
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-[11px] font-medium text-violet-300 hover:text-violet-200"
            >
              {t('auth.forgot')}
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
          disabled={loading || !hydrated}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>

      <div className="mt-6 space-y-2 border-t border-white/[0.07] pt-6 text-center text-xs text-zinc-400">
        <p>
          {t('auth.noAccount')}{' '}
          <Link href="/auth/register" className="font-semibold text-violet-300 hover:text-violet-200">
            {t('auth.registerNow')}
          </Link>
        </p>
        <p>
          {t('auth.unverified')}{' '}
          <Link
            href="/auth/verify-email/resend"
            className="font-semibold text-zinc-300 hover:text-white"
          >
            {t('auth.requestLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}
