import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import ResendVerificationForm from './resend-form';

async function ResendContent() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect('/auth/login?callbackUrl=/auth/verify-email/resend');
  }

  const verified = session.user.emailVerified !== null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">E-Mail bestätigen</h1>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">
          Angemeldet als <span className="text-zinc-200">{session.user.email}</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {verified
            ? 'Die Adresse ist bestätigt.'
            : 'Die Adresse ist noch nicht bestätigt. Ein neuer Link ersetzt alle älteren Bestätigungslinks.'}
        </p>
      </div>

      <ResendVerificationForm verified={verified} />

      <div className="mt-6 border-t border-white/[0.07] pt-6 text-center text-xs text-zinc-400">
        <Link href="/" className="font-semibold text-violet-300 hover:text-violet-200">
          Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
}

export default function ResendVerificationPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b10]/90 p-8 text-center text-sm text-zinc-500">
          Sitzung wird geprüft …
        </div>
      }
    >
      <ResendContent />
    </Suspense>
  );
}
