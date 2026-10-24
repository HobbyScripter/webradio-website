'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email,
          password,
          confirmPassword,
        }),
      });

      const data = (await res.json()) as { message?: string };

      if (!res.ok) {
        setError(data.message || 'Registrierung fehlgeschlagen.');
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push('/auth/login');
        }, 1500);
      }
    } catch {
      setError('Netzwerkfehler bei der Übermittlung.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-[#07070a] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20';
  const labelClass =
    'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300';

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">Konto erstellen</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Registriere dich für den Entwicklerbereich. Neue Konten erhalten die Rolle USER.
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

      {success ? (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200"
        >
          Konto erfolgreich erstellt. Du wirst zur Anmeldung weitergeleitet. Falls der
          E-Mail-Versand konfiguriert ist, erhältst du zusätzlich einen Bestätigungslink.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="register-name" className={labelClass}>
            Anzeigename (optional)
          </label>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Studio Nord"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="register-email" className={labelClass}>
            E-Mail-Adresse
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="register-password" className={labelClass}>
            Passwort (mindestens 8 Zeichen)
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="register-password-confirm" className={labelClass}>
            Passwort bestätigen
          </label>
          <input
            id="register-password-confirm"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••••••"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading || success}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950/40 transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? 'Konto wird erstellt …' : success ? 'Konto erstellt' : 'Registrieren'}
        </button>
      </form>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
        Eine Administrator- oder Entwicklerrolle kann nicht über dieses Formular vergeben werden.
        Rollenänderungen sind ausschließlich Administratoren vorbehalten und werden auditiert.
      </p>

      <div className="mt-6 border-t border-white/[0.07] pt-6 text-center text-xs text-zinc-400">
        Bereits registriert?{' '}
        <Link href="/auth/login" className="font-semibold text-violet-300 hover:text-violet-200">
          Hier anmelden
        </Link>
      </div>
    </div>
  );
}
