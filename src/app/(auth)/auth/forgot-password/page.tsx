'use client';

import Link from 'next/link';
import { useState } from 'react';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setError(
          response.status === 429
            ? data?.message ?? 'Zu viele Anfragen. Bitte warte einen Moment.'
            : 'Die Anfrage konnte nicht verarbeitet werden. Bitte prüfe die E-Mail-Adresse.',
        );
        return;
      }

      setMessage(
        data?.message ??
          'Wenn ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen erstellt.',
      );
    } catch {
      setError('Netzwerkfehler bei der Übermittlung.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">Passwort zurücksetzen</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Wir senden dir einen zeitlich begrenzten Link, sofern ein Konto existiert.
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
          >
            E-Mail-Adresse
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? 'Anfrage wird gesendet …' : 'Link anfordern'}
        </button>
      </form>

      <div className="mt-6 border-t border-white/[0.07] pt-6 text-center text-xs text-zinc-400">
        <Link href="/auth/login" className="font-semibold text-violet-300 hover:text-violet-200">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
