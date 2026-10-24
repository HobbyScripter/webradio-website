'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setError(
          response.status === 429
            ? data?.message ?? 'Zu viele Versuche. Bitte warte einen Moment.'
            : data?.message ?? 'Der Bestätigungslink ist ungültig oder abgelaufen.',
        );
        return;
      }

      setMessage(data?.message ?? 'E-Mail-Adresse bestätigt.');
    } catch {
      setError('Netzwerkfehler bei der Bestätigung.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
        <h1 className="text-2xl font-bold tracking-tight text-white">Link unvollständig</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Dieser Seite fehlt ein gültiges Token. Melde dich an, um einen neuen Link anzufordern.
        </p>
        <Link
          href="/auth/verify-email/resend"
          className="mt-6 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
      <h1 className="text-2xl font-bold tracking-tight text-white">E-Mail-Adresse bestätigen</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.
      </p>

      {message ? (
        <div
          role="status"
          className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200"
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-200"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <Link
          href="/auth/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Zur Anmeldung
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? 'Wird bestätigt …' : 'E-Mail-Adresse jetzt bestätigen'}
        </button>
      )}

      <div className="mt-6 border-t border-white/[0.07] pt-6 text-xs text-zinc-400">
        <Link href="/auth/login" className="font-semibold text-violet-300 hover:text-violet-200">
          Zur Anmeldung
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 text-center text-sm text-zinc-500">
          Link wird geprüft …
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
