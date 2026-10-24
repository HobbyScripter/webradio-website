import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { ROLE_LABELS } from '@/lib/roles';
import { formatDateTime } from '@/lib/format';
import RoleChangeForm from '@/components/dashboard/RoleChangeForm';
import { changeRoleAction } from '@/app/(admin)/admin/actions';
import {
  ArrowLeftIcon,
  UserIcon,
  CheckIcon,
  AlertIcon,
  ShieldIcon,
  PlugIcon,
  PaletteIcon,
} from '@/components/ui/icons';

const ROLE_CLASSES: Record<string, string> = {
  USER: 'bg-zinc-800 text-zinc-300',
  DEVELOPER: 'bg-violet-500/10 text-violet-400',
  ADMIN: 'bg-amber-500/10 text-amber-400',
  SYSTEM_ADMIN: 'bg-rose-500/10 text-rose-400',
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ roleChanged?: string; error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const admin = await requireAdminSession();

  const target = await db.orm.public.User.first({ id });
  if (!target) {
    notFound();
  }

  const [profile, sessions, auditLogs] = await Promise.all([
    db.orm.public.DeveloperProfile.where({ userId: target.id }).first(),
    db.orm.public.Session.where({ userId: target.id }).all(),
    db.orm.public.AuditLog.where({ userId: target.id })
      .orderBy((log) => log.createdAt.desc())
      .limit(20)
      .all(),
  ]);

  const [plugins, themes] = profile
    ? await Promise.all([
        db.orm.public.Plugin.where({ developerId: profile.id }).all(),
        db.orm.public.Theme.where({ developerId: profile.id }).all(),
      ])
    : [[], []];

  const isSelf = admin.id === target.id;
  const isTargetSystemAdmin = target.role === 'SYSTEM_ADMIN';
  const canEditRole = !(isTargetSystemAdmin && admin.role !== 'SYSTEM_ADMIN');

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück zur Benutzerverwaltung
      </Link>

      {query.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {query.error}
        </p>
      ) : null}
      {query.roleChanged ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-200">
          Rolle geändert und auditiert.
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-zinc-800 p-2 text-zinc-300">
            <UserIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {target.name || target.email.split('@')[0]}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{target.email}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{target.id}</span>
            </div>
          </div>
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${ROLE_CLASSES[target.role]}`}>
          {ROLE_LABELS[target.role]}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">E-Mail-Status</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm">
            {target.emailVerified ? (
              <>
                <CheckIcon className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">Verifiziert</span>
              </>
            ) : (
              <>
                <AlertIcon className="h-4 w-4 text-amber-400" />
                <span className="text-amber-400">Nicht verifiziert</span>
              </>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">Registriert</div>
          <div className="mt-1 text-sm text-zinc-300">
            {formatDateTime(target.createdAt) ?? '—'}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">Aktive Sitzungen</div>
          <div className="mt-1 text-sm text-zinc-300">{sessions.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">Erweiterungen</div>
          <div className="mt-1 flex items-center gap-3 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-1">
              <PlugIcon className="h-4 w-4 text-violet-400" />
              {plugins.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <PaletteIcon className="h-4 w-4 text-violet-400" />
              {themes.length}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <ShieldIcon className="h-4 w-4" />
            Rolle und Berechtigungen
          </h2>

          {isTargetSystemAdmin && admin.role !== 'SYSTEM_ADMIN' ? (
            <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3 text-xs text-rose-200">
              Dieses Konto ist Systemadministrator. Nur ein Systemadministrator darf es ändern.
            </p>
          ) : null}

          {isSelf ? (
            <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
              Du bearbeitest dein eigenes Konto. Eine Selbstherabstufung wird serverseitig
              abgelehnt; ein anderes berechtigtes Konto muss die Änderung vornehmen.
            </p>
          ) : null}

          <RoleChangeForm
            action={changeRoleAction}
            userId={target.id}
            currentRole={target.role}
            disabled={!canEditRole}
            disabledReason="Nur ein Systemadministrator darf ein Systemadministrator-Konto ändern."
          />

          {profile ? (
            <div className="mt-5 border-t border-zinc-800 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Entwicklerprofil
              </h3>
              <p className="mt-1 text-sm text-zinc-200">{profile.displayName}</p>
              {profile.websiteUrl ? (
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-400 hover:text-violet-300"
                >
                  {profile.websiteUrl}
                </a>
              ) : null}
            </div>
          ) : null}

          <p className="mt-5 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
            Kontodeaktivierung und -löschung sind im aktuellen Datenmodell nicht vorgesehen und
            werden hier deshalb bewusst nicht angeboten.
          </p>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">
            Letzte Audit-Ereignisse dieses Kontos
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-zinc-400">Keine Audit-Einträge vorhanden.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 text-sm">
              {auditLogs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-zinc-200">{log.action}</span>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(log.createdAt) ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            IP-Adressen und Rohdetails werden hier bewusst nicht angezeigt.
          </p>
        </section>
      </div>
    </div>
  );
}
