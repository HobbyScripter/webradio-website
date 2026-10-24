'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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

      if (res?.error) {
        setError('Ungültige Anmeldedaten. Bitte überprüfe E-Mail und Passwort.');
      } else {
        router.push('/developer');
        router.refresh();
      }
    } catch {
      setError('Ein Fehler ist bei der Anmeldung aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white tracking-tight">Anmelden</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Melde dich mit deinem Entwickler- oder Radio-Account an
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
            E-Mail-Adresse
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="developer@webradio.local"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Passwort
            </label>
            <Link
              href="/auth/reset"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Vergessen?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-md shadow-violet-600/25 active:scale-[0.99] mt-2 flex items-center justify-center gap-2"
        >
          {loading ? 'Wird angemeldet...' : 'Anmelden'}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-400">
        Noch kein Konto?{' '}
        <Link href="/auth/register" className="text-violet-400 hover:text-violet-300 font-semibold">
          Jetzt registrieren
        </Link>
      </div>
    </div>
  );
}
