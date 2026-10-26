'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const REASONS = [
  { value: 'ILLEGAL', label: 'Rechtswidriger Inhalt' },
  { value: 'MALWARE', label: 'Schadcode oder Malware' },
  { value: 'COPYRIGHT', label: 'Urheberrechtsverletzung' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'MISLEADING', label: 'Irreführende Angaben' },
  { value: 'OTHER', label: 'Sonstiges' },
] as const;

export default function ReportForm({
  targetType,
  targetId,
  targetLabel,
}: {
  targetType: string;
  targetId: string;
  targetLabel: string;
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setMessage(null);

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          details: details.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!response.ok) {
        setStatus('error');
        setMessage(payload?.message ?? 'Die Meldung konnte nicht gespeichert werden.');
        return;
      }

      setStatus('sent');
      setMessage(
        payload?.message ??
          'Meldung eingegangen. Ein Administrator prüft den Inhalt; die Meldung allein ändert nichts.',
      );
    } catch {
      setStatus('error');
      setMessage('Die Meldung konnte nicht gesendet werden.');
    }
  }

  if (status === 'sent') {
    return (
      <p
        role="status"
        className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200"
      >
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {status === 'error' && message ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
        >
          {message}
        </p>
      ) : null}

      <p className="text-sm text-zinc-400">
        Gemeldet wird: <span className="text-zinc-200">{targetLabel}</span>
      </p>

      <div>
        <label htmlFor="report-reason" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Grund <span className="text-rose-400">*</span>
        </label>
        <select
          id="report-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          <option value="" disabled>
            Bitte wählen
          </option>
          {REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="report-details" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Beschreibung {reason === 'OTHER' ? <span className="text-rose-400">*</span> : '(optional)'}
        </label>
        <textarea
          id="report-details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={2000}
          rows={5}
          required={reason === 'OTHER'}
          aria-describedby="report-details-hint"
          className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="Was ist an diesem Eintrag problematisch? Bitte keine personenbezogenen Daten Dritter."
        />
        <p id="report-details-hint" className="mt-1 text-xs text-zinc-500">
          Höchstens 2000 Zeichen. Wird ausschließlich als Text gespeichert.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        Eine Meldung ist ein Hinweis und keine Feststellung eines Verstoßes. Nur berechtigte
        Administratoren prüfen sie; eine Meldung allein löst keine Maßnahme aus.
      </p>

      <Button type="submit" disabled={status === 'sending' || reason === ''}>
        {status === 'sending' ? 'Wird gesendet …' : 'Meldung absenden'}
      </Button>
    </form>
  );
}
