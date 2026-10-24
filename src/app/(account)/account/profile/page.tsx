'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { Container, SectionHeading } from '@/components/ui/layout';
import { Button, ButtonLink } from '@/components/ui/button';
import { UserIcon, CheckIcon, AlertIcon, ArrowLeftIcon } from '@/components/ui/icons';
import { SITE_NAME } from '@/lib/site';

type ProfileFormData = {
  name: string;
  email: string;
  currentPassword: string;
};

export default function AccountProfilePage() {
  const router = useRouter();
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    email: '',
    currentPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await getSession();
        if (session?.user) {
          setFormData({
            name: session.user.name ?? '',
            email: session.user.email ?? '',
            currentPassword: '',
          });
          setEmailVerified(!!session.user.emailVerified);
        } else {
          router.push('/auth/login?callbackUrl=/account/profile');
        }
      } catch {
        router.push('/auth/login?callbackUrl=/account/profile');
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim() || null,
          email: formData.email.trim(),
          currentPassword: formData.currentPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Fehler beim Speichern des Profils');
      }

      setSuccess('Profil erfolgreich aktualisiert!');
      
      // Refresh session
      const newSession = await getSession();
      if (newSession?.user) {
        setFormData({
          name: newSession.user.name ?? '',
          email: newSession.user.email ?? '',
          currentPassword: '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Container className="py-12">
        <div className="text-center text-zinc-500 text-sm">Profil wird geladen...</div>
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
        title="Profil bearbeiten"
        description="Ändere deine persönlichen Informationen. Deine E-Mail-Adresse wird für die Anmeldung verwendet."
      />

      {/* Email Verification Alert */}
      {!emailVerified && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200 flex items-start gap-3">
          <AlertIcon className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">E-Mail-Adresse nicht bestätigt</p>
            <p className="mt-0.5 text-amber-300/80">
              Deine E-Mail-Adresse ist noch nicht verifiziert. Bestätige sie, um alle Funktionen nutzen zu können.
            </p>
            <Link
              href="/auth/verify-email/resend"
              className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-amber-300 hover:text-amber-200"
            >
              Bestätigungslink anfordern
            </Link>
          </div>
        </div>
      )}

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

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="profile-name"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Anzeigename
            </label>
            <input
              id="profile-name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="Dein Name"
              maxLength={100}
              className="w-full rounded-xl border border-white/10 bg-[#07070a] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Wird in deinem öffentlichen Profil angezeigt. Optional.
            </p>
          </div>

          <div>
            <label
              htmlFor="profile-email"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              E-Mail-Adresse
            </label>
            <input
              id="profile-email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@example.com"
              required
              className="w-full rounded-xl border border-white/10 bg-[#07070a] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Wird für die Anmeldung verwendet. Eine Änderung erfordert die Bestätigung der neuen Adresse.
            </p>
          </div>

          <div>
            <label
              htmlFor="profile-current-password"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Aktuelles Passwort *
            </label>
            <input
              id="profile-current-password"
              name="currentPassword"
              type="password"
              value={formData.currentPassword}
              onChange={handleChange}
              placeholder="Gib dein aktuelles Passwort ein"
              required={formData.email !== ''}
              minLength={1}
              className="w-full rounded-xl border border-white/10 bg-[#07070a] px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Erforderlich, um Änderungen am Profil zu bestätigen.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            size="md"
            className="min-w-[140px]"
          >
            {isSubmitting ? 'Speichern...' : 'Profil speichern'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => router.push('/account')}
          >
            Abbrechen
          </Button>
        </div>
      </form>

      {/* Info Section */}
      <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-6 mt-8">
        <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3">
          Wichtig
        </h3>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex items-start gap-2">
            <UserIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Dein Name wird in der Navigation und auf deiner Profilseite angezeigt.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Nach dem Ändern der E-Mail-Adresse erhältst du eine Bestätigungsmail an die neue Adresse.</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldIcon className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>Dein aktuelles Passwort ist erforderlich, um Änderungen zu bestätigen.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// Import ShieldIcon for the info section
import { ShieldIcon } from '@/components/ui/icons';
