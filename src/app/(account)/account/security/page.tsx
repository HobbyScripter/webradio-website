'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, signOut } from 'next-auth/react';
import { Container, SectionHeading } from '@/components/ui/layout';
import { Button, ButtonLink } from '@/components/ui/button';
import { ShieldIcon, CheckIcon, AlertIcon, ArrowLeftIcon, TrashIcon, CalendarIcon } from '@/components/ui/icons';

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function AccountSecurityPage() {
  const router = useRouter();
  const [passwordForm, setPasswordForm] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; ipAddress: string | null; userAgent: string | null; createdAt: string; isCurrent: boolean }>>([]);

  // Load session data
  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await getSession();
        if (session?.user) {
          
          // Load sessions
          const sessionsResponse = await fetch('/api/account/sessions');
          if (sessionsResponse.ok) {
            const sessionsData = await sessionsResponse.json();
            setSessions(sessionsData.sessions);
          }
        } else {
          router.push('/auth/login?callbackUrl=/account/security');
        }
      } catch {
        router.push('/auth/login?callbackUrl=/account/security');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [router]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    
    if (passwordForm.newPassword.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Fehler beim Ändern des Passworts');
      }

      setSuccess('Passwort erfolgreich geändert!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Möchtest du diese Sitzung wirklich beenden?')) {
      return;
    }

    try {
      const response = await fetch(`/api/account/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Fehler beim Beenden der Sitzung');
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSuccess('Sitzung erfolgreich beendet.');
      
      // If we revoked our own session, we need to logout
      if (sessionId === sessions.find(s => s.isCurrent)?.id) {
        await signOut({ callbackUrl: '/auth/login' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm('Möchtest du alle anderen Sitzungen wirklich beenden? Du bleibst in deiner aktuellen Sitzung angemeldet.')) {
      return;
    }

    try {
      const response = await fetch('/api/account/sessions', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Fehler beim Beenden aller Sitzungen');
      }

      setSessions((prev) => [prev.find(s => s.isCurrent)!]);
      setSuccess('Alle anderen Sitzungen erfolgreich beendet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Container className="py-12">
        <div className="text-center text-zinc-500 text-sm">Sicherheitseinstellungen werden geladen...</div>
      </Container>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <ButtonLink
          href="/account"
          variant="ghost"
          size="sm"
          className="inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </ButtonLink>
      </div>

      <SectionHeading
        eyebrow="Kontoeinstellungen"
        title="Sicherheit"
        description="Verwalte dein Passwort und aktive Sitzungen."
      />

      {/* Success Message */}
      {success && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200 flex items-center gap-3">
          <CheckIcon className="h-5 w-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-4 text-sm text-rose-200 flex items-center gap-3">
          <AlertIcon className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Change Password Section */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ShieldIcon className="h-5 w-5" />
          Passwort ändern
        </h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
          <div>
            <label
              htmlFor="current-password"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Aktuelles Passwort
            </label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange}
              placeholder="Aktuelles Passwort"
              required
              className="w-full rounded-xl border border-white/10 bg-[#07070a] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          <div>
            <label
              htmlFor="new-password"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Neues Passwort
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={handlePasswordChange}
              placeholder="Neues Passwort (min. 8 Zeichen)"
              minLength={8}
              required
              className="w-full rounded-xl border border-white/10 bg-[#07070a] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Passwort bestätigen
            </label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordChange}
              placeholder="Neues Passwort wiederholen"
              required
              className="w-full rounded-xl border border-white/10 bg-[#07070a] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          <div className="pt-2">
            <Button type="submit" disabled={isSubmitting} size="sm">
              {isSubmitting ? 'Ändern...' : 'Passwort ändern'}
            </Button>
          </div>
        </form>
      </div>

      {/* Active Sessions Section */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Aktive Sitzungen
          </h2>
          {sessions.length > 1 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRevokeAllSessions}
            >
              Alle beenden
            </Button>
          )}
        </div>
        
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine aktiven Sitzungen gefunden.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 text-sm">
            {sessions.map((session) => (
              <li key={session.id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md ${
                        session.isCurrent 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {session.isCurrent ? <CheckIcon className="h-4 w-4" /> : <CalendarIcon className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-medium text-white">
                          {session.isCurrent ? 'Aktuelle Sitzung' : session.userAgent || 'Unbekanntes Gerät'}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {session.ipAddress || 'IP nicht verfügbar'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {formatDate(session.createdAt)}
                    </span>
                    {!session.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeSession(session.id)}
                        className="text-zinc-400 hover:text-rose-400 hover:bg-rose-500/5"
                        aria-label="Sitzung beenden"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-zinc-500">
          Du bist aktuell in {sessions.length} Sitzung(en) angemeldet. Beende Sitzungen, die du nicht erkennst.
        </p>
      </div>

      {/* Security Tips */}
      <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-6">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3">
          Sicherheitstipps
        </h3>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex items-start gap-2">
            <ShieldIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Verwende ein einzigartiges, sicheres Passwort für dein {process.env.SITE_NAME || 'WebRadio'}-Konto.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Ändere dein Passwort regelmäßig und nach verdächtigen Aktivitäten.</span>
          </li>
          <li className="flex items-start gap-2">
            <CalendarIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Überprüfe regelmäßig deine aktiven Sitzungen und beende unbekannte Geräte.</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Aktiviere die Zwei-Faktor-Authentifizierung (2FA) für zusätzlichen Schutz. (Kommt bald)</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
