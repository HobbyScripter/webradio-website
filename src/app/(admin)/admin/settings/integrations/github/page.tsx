import type { Metadata } from 'next';
import { getServerAuthSession } from '@/lib/server-auth';
import { hasRole } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { Container, PageHeader } from '@/components/ui/layout';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import {
  GitHubIcon,
  ShieldIcon,
  ExternalLinkIcon,
} from '@/components/ui/icons';
import { getGitHubIntegrationStatus } from '@/lib/github-app';

export const metadata: Metadata = {
  title: 'GitHub Integration',
  robots: { index: false, follow: false },
};

export default async function GitHubIntegrationPage() {
  const session = await getServerAuthSession();
  if (!session?.user || !hasRole(session.user.role, 'ADMIN')) {
    redirect('/auth/login?callbackUrl=/admin/settings/integrations/github');
  }

  const status = await getGitHubIntegrationStatus();

  return (
    <Container className="space-y-8 py-8">
      <PageHeader
        eyebrow="Einstellungen → Integrationen"
        title="GitHub App Integration"
        description="Zentrale, native GitHub-Anbindung für Release-Daten, Webhook-Ereignisse und Download-Statistiken."
      />

      {/* Status Overview Card */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <GitHubIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{status.appName}</h2>
              <p className="text-xs text-zinc-400">
                Modus: {status.mode === 'github-app' ? 'Native GitHub App (JWT & Installation Tokens)' : status.mode === 'personal-access-token' ? 'Personal Access Token' : 'Nicht konfiguriert'}
              </p>
            </div>
          </div>

          <div>
            <Badge
              tone={
                status.status === 'CONNECTED'
                  ? 'success'
                  : status.status === 'SUSPENDED'
                  ? 'warning'
                  : 'danger'
              }
            >
              {status.status === 'CONNECTED'
                ? 'Verbunden'
                : status.status === 'SUSPENDED'
                ? 'Ausgesetzt'
                : status.status === 'DELETED'
                ? 'Deinstalliert'
                : status.status === 'ERROR'
                ? 'Verbindung fehlgeschlagen'
                : 'Nicht verbunden'}
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t border-white/[0.06] pt-5 text-xs">
          <div>
            <span className="text-zinc-500 block">Autorisiertes Repository:</span>
            <span className="font-mono text-zinc-200 font-semibold">{status.repository}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Verbundener Account:</span>
            <span className="font-mono text-zinc-200">{status.accountLogin ?? '–'}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Installation ID:</span>
            <span className="font-mono text-zinc-200">{status.installationId ?? '–'}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">App ID (nur Anzeige):</span>
            <span className="font-mono text-zinc-200">{status.appId ?? '–'}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Client ID (JWT-Issuer):</span>
            <span className="font-mono text-zinc-200">{status.clientId ?? '–'}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Letzter API-Aufruf:</span>
            <span className="text-zinc-200">
              {status.lastApiCallAt ? formatDateTime(status.lastApiCallAt) : 'Noch kein API-Aufruf protokolliert'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Letzter Webhook empfangen:</span>
            <span className="text-zinc-200">
              {status.lastWebhookAt ? formatDateTime(status.lastWebhookAt) : 'Noch kein Webhook empfangen'}
            </span>
          </div>
        </div>

        {/* Permissions */}
        <div className="border-t border-white/[0.06] pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Gewährte Berechtigungen
          </h3>
          {status.permissions ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(status.permissions).map(([scope, level]) => (
                <span
                  key={scope}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-mono text-zinc-300"
                >
                  {scope}: <strong className="text-emerald-400">{level}</strong>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Standardmäßige Leserechte (contents: read, metadata: read).
            </p>
          )}
        </div>

        {/* Read-only connection check */}
        {status.check ? (
          <div className="border-t border-white/[0.06] pt-5 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Verbindungsprüfung (nur lesend)
              </h3>
              <ButtonLink
                href="/admin/settings/integrations/github"
                variant="secondary"
                size="sm"
              >
                Erneut prüfen
              </ButtonLink>
            </div>
            <p
              className={
                status.check.ok ? 'text-xs text-emerald-300' : 'text-xs text-rose-300'
              }
            >
              {status.check.message}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div>
                <dt className="text-zinc-500">Code</dt>
                <dd className="font-mono text-zinc-200">{status.check.code}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Schritt</dt>
                <dd className="font-mono text-zinc-200">{status.check.stage}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">HTTP-Status</dt>
                <dd className="font-mono text-zinc-200">{status.check.httpStatus ?? '–'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Geprüft</dt>
                <dd className="text-zinc-200">{formatDateTime(status.check.checkedAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      {/* Setup & Installation Guidance */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0b0b10] p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldIcon className="h-5 w-5 text-violet-400" />
          Offizieller Installations- und Sicherheitsleitfaden
        </h2>

        <div className="space-y-3 text-xs text-zinc-400 leading-relaxed">
          <p>
            Eine Installation oder Neuverbindung erfolgt ausschließlich über den offiziellen
            GitHub-Installationsdialog. Es werden zu keinem Zeitpunkt private Schlüssel oder
            Installationstokens an den Client ausgegeben oder im Browser gerendert.
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-zinc-300">
            <li>
              Erstelle die GitHub App in der GitHub-Organisation oder dem Benutzerkonto{' '}
              <code className="font-mono text-zinc-200">YourEliteSystems</code>.
            </li>
            <li>
              Vergib ausschließlich <strong>Leserechte</strong> (z.B.{' '}
              <code className="font-mono text-zinc-200">Contents: Read-only</code> und{' '}
              <code className="font-mono text-zinc-200">Metadata: Read-only</code>).
            </li>
            <li>
              Richte die Webhook-URL auf{' '}
              <code className="font-mono text-zinc-200">https://&lt;deine-domain&gt;/api/webhooks/github</code>{' '}
              ein und abonniere Ereignisse für <em>Releases</em> und <em>Installation</em>.
            </li>
            <li>
              Generiere einen Private Key (.pem) und hinterlege die Umgebungsvariablen auf dem Server.
            </li>
            <li>
              Installiere die GitHub App gezielt nur auf dem Repository{' '}
              <code className="font-mono text-zinc-200">YourEliteSystems/WebRadio</code>.
            </li>
          </ol>
        </div>

        <div className="pt-2">
          <ButtonLink
            href="https://github.com/settings/apps"
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="sm"
            className="inline-flex items-center gap-1.5"
          >
            <GitHubIcon className="h-4 w-4" /> GitHub Apps verwalten
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      </section>
    </Container>
  );
}

