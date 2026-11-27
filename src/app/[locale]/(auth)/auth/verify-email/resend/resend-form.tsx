'use client';

import { useState } from 'react';

export default function ResendVerificationForm({ verified }: { verified: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setError(
          response.status === 429
            ? data?.message ?? 'Zu viele Anfragen. Bitte warte einen Moment.'
            : data?.message ?? 'Der Link konnte nicht angefordert werden.',
        );
        return;
      }

      setMessage(data?.message ?? 'Bestätigungslink angefordert.');
    } catch {
      setError('Netzwerkfehler bei der Anfrage.');
    } finally {
      setLoading(false);
    }
  };

  if (verified) {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200"
      >
        Deine E-Mail-Adresse ist bereits bestätigt.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200"
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleResend}
        disabled={loading}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {loading ? 'Wird angefordert …' : 'Neuen Bestätigungslink anfordern'}
      </button>
    </div>
  );
}
