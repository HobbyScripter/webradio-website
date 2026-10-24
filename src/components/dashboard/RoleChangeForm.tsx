'use client';

import { useState } from 'react';

const ASSIGNABLE_ROLES = [
  { value: 'USER', label: 'Benutzer' },
  { value: 'DEVELOPER', label: 'Entwickler' },
  { value: 'ADMIN', label: 'Administrator' },
] as const;

/**
 * Role selector for the admin user detail page.
 *
 * SYSTEM_ADMIN is deliberately absent: it is only granted by the audited CLI
 * bootstrap/recovery path. The server re-validates the submitted role with
 * `assignableRoleSchema` and re-checks the actor, target and last-admin guards.
 */
export default function RoleChangeForm({
  action,
  userId,
  currentRole,
  disabled = false,
  disabledReason,
}: {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  currentRole: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const initial = ASSIGNABLE_ROLES.some((role) => role.value === currentRole)
    ? currentRole
    : 'USER';
  const [role, setRole] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const changed = role !== currentRole;

  if (disabled) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        {disabledReason ?? 'Rollenänderungen sind für dieses Konto nicht verfügbar.'}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />

      <div>
        <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Neue Rolle
        </label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setConfirmed(false);
          }}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-rose-400"
        >
          {ASSIGNABLE_ROLES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Die Rolle „Systemadministrator“ kann hier nicht vergeben werden.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-rose-500"
        />
        <span>Ich bestätige die Rollenänderung. Sie wird auditiert.</span>
      </label>

      <button
        type="submit"
        disabled={!confirmed || !changed}
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Rolle speichern
      </button>
      {!changed ? (
        <p className="text-xs text-zinc-500">Wähle eine andere Rolle, um zu speichern.</p>
      ) : null}
    </form>
  );
}
