'use client';

import Link from '@/i18n/navigation';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import DashboardPageHeader from '@/components/dashboard/DashboardPageHeader';
import {
  EmptyRow,
  Field,
  FormGrid,
  Notice,
  Panel,
  StatusBadge,
  TableHead,
  TableShell,
  Td,
  Th,
  fieldClass,
  smallButtonClass,
} from '@/components/admin/portal-ui';
import {
  APPLICATION_STATUS,
  FORMAT_LABELS,
  PLACEMENT_LABELS,
} from '@/lib/advertising/labels';
import { APPLICATION_STATUS_TRANSITIONS } from '@/lib/advertising/validations';
import { formatDate, formatDateTime } from '@/lib/format';
import { MailIcon, PlusIcon, UserIcon } from '@/components/ui/icons';

type ApplicationStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

type ApplicationRow = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  websiteUrl: string | null;
  phone: string | null;
  adFormat: string;
  placement: string;
  desiredStartDate: string | null;
  desiredEndDate: string | null;
  description: string;
  desiredBudget: string | null;
  customMessage: string | null;
  status: ApplicationStatus;
  rejectionReason: string | null;
  internalNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const FILTERS: { value: '' | ApplicationStatus; label: string }[] = [
  { value: '', label: 'Alle' },
  { value: 'PENDING', label: 'Ausstehend' },
  { value: 'UNDER_REVIEW', label: 'In Prüfung' },
  { value: 'APPROVED', label: 'Genehmigt' },
  { value: 'REJECTED', label: 'Abgelehnt' },
];

const ACTION_LABELS: Record<string, string> = {
  UNDER_REVIEW: 'Prüfen',
  APPROVED: 'Genehmigen',
  REJECTED: 'Ablehnen',
  WITHDRAWN: 'Zurückziehen',
  PENDING: 'Zurück zu ausstehend',
};

const ACTION_VARIANTS: Record<string, 'primary' | 'secondary' | 'destructive'> = {
  APPROVED: 'primary',
  UNDER_REVIEW: 'secondary',
  REJECTED: 'destructive',
  WITHDRAWN: 'secondary',
  PENDING: 'secondary',
};

export default function AdvertisingApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'' | ApplicationStatus>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;
    const url = filter
      ? `/api/admin/advertising/applications?status=${encodeURIComponent(filter)}`
      : '/api/admin/advertising/applications';

    fetch(url)
      .then((response) => response.json() as Promise<{ applications?: ApplicationRow[] }>)
      .then((data) => {
        if (!cancelled) {
          setApplications(data.applications ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ tone: 'error', text: 'Bewerbungen konnten nicht geladen werden.' });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  const selected = applications.find((application) => application.id === selectedId) ?? null;

  const openDetails = (application: ApplicationRow) => {
    setSelectedId(application.id);
    setNotes(application.internalNotes ?? '');
    setRejectionReason(application.rejectionReason ?? '');
    setMessage(null);
  };

  const patch = async (body: Record<string, unknown>, successText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/advertising/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? 'Änderung fehlgeschlagen.' });
        return;
      }

      setMessage({ tone: 'success', text: successText });
      reload();

      if (selectedId && body['status'] !== undefined) {
        const refreshed = await fetch('/api/admin/advertising/applications').then(
          (res) => res.json() as Promise<{ applications?: ApplicationRow[] }>,
        );
        const current = (refreshed.applications ?? []).find((row) => row.id === selectedId);
        if (current) {
          setNotes(current.internalNotes ?? '');
          setRejectionReason(current.rejectionReason ?? '');
        }
      }
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler bei der Änderung.' });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (application: ApplicationRow, status: ApplicationStatus) =>
    patch(
      {
        id: application.id,
        status,
        ...(status === 'REJECTED' && rejectionReason ? { rejectionReason } : {}),
      },
      `Status auf „${APPLICATION_STATUS[status]?.label ?? status}“ gesetzt.`,
    );

  const saveNotes = (application: ApplicationRow) =>
    patch({ id: application.id, internalNotes: notes }, 'Interne Notiz gespeichert.');

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Werbepartner-Bewerbungen"
        description="Bewerbungen prüfen, genehmigen oder ablehnen und interne Notizen festhalten."
        icon={<UserIcon className="h-6 w-6" />}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((entry) => (
          <button
            key={entry.value || 'all'}
            type="button"
            onClick={() => setFilter(entry.value)}
            aria-pressed={filter === entry.value}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === entry.value
                ? 'border border-violet-500/20 bg-violet-500/10 text-violet-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-500">Bewerbungen werden geladen…</p>
      ) : (
        <TableShell caption="Werbepartner-Bewerbungen" minWidth="min-w-[52rem]">
          <TableHead>
            <Th>Unternehmen</Th>
            <Th>Kontakt</Th>
            <Th>Status</Th>
            <Th>Eingang</Th>
            <Th align="right">Aktionen</Th>
          </TableHead>
          <tbody className="divide-y divide-zinc-800">
            {applications.length === 0 ? (
              <EmptyRow colSpan={5}>
                {filter
                  ? 'Keine Bewerbungen mit diesem Status.'
                  : 'Noch keine Bewerbungen eingegangen. Neue Bewerbungen erscheinen hier automatisch.'}
              </EmptyRow>
            ) : (
              applications.map((application) => {
                const nextStatuses = APPLICATION_STATUS_TRANSITIONS[application.status].filter(
                  (status) => status !== 'REJECTED' && status !== 'WITHDRAWN',
                );

                return (
                  <tr key={application.id} className="hover:bg-zinc-800/30">
                    <Td>
                      <span className="font-semibold text-white">{application.companyName}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {FORMAT_LABELS[application.adFormat as keyof typeof FORMAT_LABELS] ??
                          application.adFormat}
                        {' · '}
                        {PLACEMENT_LABELS[application.placement as keyof typeof PLACEMENT_LABELS] ??
                          application.placement}
                      </span>
                    </Td>
                    <Td>
                      <span className="block text-zinc-300">{application.contactName}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                        <MailIcon className="h-3 w-3" />
                        {application.email}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge map={APPLICATION_STATUS} status={application.status} />
                    </Td>
                    <Td className="text-xs text-zinc-500">{formatDate(application.createdAt)}</Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          className={smallButtonClass}
                          onClick={() => openDetails(application)}
                        >
                          Details
                        </button>
                        {nextStatuses.slice(0, 2).map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={smallButtonClass}
                            disabled={busy}
                            onClick={() => changeStatus(application, status)}
                          >
                            {ACTION_LABELS[status] ?? status}
                          </button>
                        ))}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      )}

      {selected ? (
        <Panel
          title={`Bewerbung: ${selected.companyName}`}
          description={`Eingegangen am ${formatDateTime(selected.createdAt) ?? '—'}${
            selected.reviewedAt
              ? ` · zuletzt geprüft am ${formatDateTime(selected.reviewedAt) ?? '—'}`
              : ''
          }`}
          action={
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              Schließen
            </Button>
          }
        >
          <div className="space-y-5">
            <FormGrid>
              <div className="text-sm text-zinc-300">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Ansprechpartner</p>
                <p className="mt-1">
                  {selected.contactName}
                  {selected.phone ? ` · ${selected.phone}` : ''}
                </p>
                <p className="text-zinc-400">{selected.email}</p>
                {selected.websiteUrl ? (
                  <a
                    href={selected.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-300 hover:text-violet-200"
                  >
                    {selected.websiteUrl}
                  </a>
                ) : null}
              </div>
              <div className="text-sm text-zinc-300">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Zeitraum & Budget</p>
                <p className="mt-1">
                  {formatDate(selected.desiredStartDate) ?? 'offen'} –{' '}
                  {formatDate(selected.desiredEndDate) ?? 'offen'}
                </p>
                <p className="text-zinc-400">{selected.desiredBudget ?? 'Kein Budget angegeben'}</p>
              </div>
            </FormGrid>

            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Beschreibung</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                {selected.description}
              </p>
            </div>

            {selected.customMessage ? (
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Nachricht</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {selected.customMessage}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="internal-notes" label="Interne Notiz" hint="Nur für Administratoren sichtbar.">
                <textarea
                  id="internal-notes"
                  rows={3}
                  className={fieldClass}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Rückfragen, Konditionen, nächste Schritte…"
                />
              </Field>
              <Field
                id="rejection-reason"
                label="Ablehnungsgrund"
                hint="Wird bei einer Ablehnung gespeichert."
              >
                <textarea
                  id="rejection-reason"
                  rows={3}
                  className={fieldClass}
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  placeholder="Begründung für die Ablehnung…"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => saveNotes(selected)}>
                Notiz speichern
              </Button>
              {APPLICATION_STATUS_TRANSITIONS[selected.status].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={ACTION_VARIANTS[status] ?? 'secondary'}
                  disabled={busy}
                  onClick={() => changeStatus(selected, status)}
                >
                  {ACTION_LABELS[status] ?? status}
                </Button>
              ))}
            </div>

            {selected.status === 'APPROVED' ? (
              <Notice tone="info">
                Genehmigt. Der nächste Schritt ist das Anlegen eines Werbepartners unter
                „Werbepartner“.
              </Notice>
            ) : null}
            {selected.rejectionReason ? (
              <p className="text-xs text-zinc-500">
                Gespeicherter Ablehnungsgrund: {selected.rejectionReason}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <Badge tone="neutral">Hinweis</Badge>
        <PlusIcon className="h-3.5 w-3.5" />
        Neue Bewerbungen entstehen ausschließlich über das öffentliche Formular unter
        <Link className="text-violet-300 hover:text-violet-200" href="/advertising">
          /advertising
        </Link>
        .
      </p>
    </div>
  );
}
