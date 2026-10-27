'use client';

import { useState } from 'react';

export default function ManualEmailVerificationForm({
  action,
  userId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm('E-Mail-Adresse dieses Kontos manuell als verifiziert markieren?')) {
          e.preventDefault();
        } else {
          setPending(true);
        }
      }}
      className="mt-3 space-y-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs leading-relaxed text-zinc-500">
        Markiert das Konto als E-Mail-verifiziert, ohne eine E-Mail zu versenden.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
      >
        E-Mail manuell verifizieren
      </button>
    </form>
  );
}