'use client';

import { useState } from 'react';

const DECISIONS = [
  {
    value: 'APPROVED',
    label: 'Genehmigen',
    description: 'Der Eintrag wird veröffentlicht, sofern eine Version hinterlegt ist.',
  },
  {
    value: 'CHANGES_REQUESTED',
    label: 'Änderungen anfordern',
    description: 'Der Eintrag bleibt offline; die Begründung ist für den Entwickler sichtbar.',
  },
  {
    value: 'REJECTED',
    label: 'Ablehnen',
    description: 'Der Eintrag wird dauerhaft abgelehnt; die Begründung ist sichtbar.',
  },
] as const;

/**
 * Decision form. The server re-validates the decision, requires the reason for
 * anything other than approval, and rejects stale submissions.
 */
export default function ModerationDecisionForm({
  action,
  targetType,
  targetId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  targetType: 'PLUGIN' | 'THEME';
  targetId: string;
}) {
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]['value']>('APPROVED');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const notesRequired = decision !== 'APPROVED';
  const notesValid = !notesRequired || notes.trim().length >= 10;
  const canSubmit = confirmed && notesValid;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-300">Entscheidung</legend>
        <div className="space-y-2">
          {DECISIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                decision === option.value
                  ? 'border-violet-500/40 bg-violet-500/[0.07]'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={option.value}
                checked={decision === option.value}
                onChange={() => setDecision(option.value)}
                className="mt-1 h-4 w-4 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-semibold text-white">{option.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-400">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="moderation-notes" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Begründung {notesRequired ? <span className="text-rose-400">*</span> : '(optional)'}
        </label>
        <textarea
          id="moderation-notes"
          name="notes"
          rows={4}
          maxLength={2000}
          required={notesRequired}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-describedby="moderation-notes-help"
          className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white placeholder:text-zinc-500 focus:border-transparent focus:ring-2 focus:ring-violet-400 focus:outline-none"
          placeholder={
            notesRequired
              ? 'Was muss geändert werden? Der Entwickler sieht diesen Text.'
              : 'Optionale Anmerkung für den Entwickler.'
          }
        />
        <p id="moderation-notes-help" className="mt-1 text-xs text-zinc-500">
          {notesRequired
            ? `Mindestens 10 Zeichen${notes.trim().length > 0 ? ` (${notes.trim().length}/10)` : ''}.`
            : 'Die Begründung wird im Audit-Protokoll und für den Entwickler gespeichert.'}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-violet-500"
        />
        <span>
          Ich bestätige diese Entscheidung. Sie wird im Audit-Protokoll festgehalten und kann
          nicht unbemerkt zurückgenommen werden.
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Entscheidung speichern
      </button>
    </form>
  );
}
