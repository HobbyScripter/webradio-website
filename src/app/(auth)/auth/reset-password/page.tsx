'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20';
const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setError(
          response.status === 429
            ? data?.message ?? 'Zu viele Versuche. Bitte warte einen Moment.'
            : data?.message ?? 'Der Link ist ungültig oder abgelaufen.',
        );
        return;
      }

      setPassword('');
      setConfirmPassword('');
      setMessage(data?.message ?? 'Passwort geändert. Bitte melde dich neu an.');
    } catch {
      setError('Netzwerkfehler bei der Übermittlung.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">Link unvollständig</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Dieser Seite fehlt ein gültiges Token. Fordere einen neuen Link an.
        </p>
        <Link
          href="/auth/forgot-password"
          className="mt-6 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">Neues Passwort festlegen</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Der Link ist einmal verwendbar und läuft nach 60 Minuten ab.
        </p>
      </div>

      {message ? (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200"
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <Link
          href="/auth/login"
          className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Zur Anmeldung
        </Link>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className={labelClass}>
              Neues Passwort (mindestens 8 Zeichen)
            </label>
            <input
              id="reset-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="reset-password-confirm" className={labelClass}>
              Passwort bestätigen
            </label>
            <input
              id="reset-password-confirm"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••••••"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? 'Passwort wird geändert …' : 'Passwort ändern'}
          </button>
        </form>
      )}

      <div className="mt-6 border-t border-white/[0.07] pt-6 text-center text-xs text-zinc-400">
        <Link href="/auth/login" className="font-semibold text-violet-300 hover:text-violet-200">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 text-center text-sm text-zinc-500">
          Link wird geprüft …
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
