'use client';

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
import { ADVERTISER_STATUS } from '@/lib/advertising/labels';
import { formatDate } from '@/lib/format';
import { MailIcon, PlusIcon } from '@/components/ui/icons';

type AdvertiserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

type AdvertiserRow = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  websiteUrl: string | null;
  description: string | null;
  status: AdvertiserStatus;
  campaignCount: number;
  createdAt: string;
};

type FormState = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  websiteUrl: string;
  description: string;
  status: AdvertiserStatus;
};

const EMPTY_FORM: FormState = {
  id: '',
  companyName: '',
  contactName: '',
  email: '',
  websiteUrl: '',
  description: '',
  status: 'ACTIVE',
};

export default function AdvertisersPage() {
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/admin/advertising/advertisers')
      .then((response) => response.json() as Promise<{ advertisers?: AdvertiserRow[] }>)
      .then((data) => {
        if (!cancelled) {
          setAdvertisers(data.advertisers ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ tone: 'error', text: 'Werbepartner konnten nicht geladen werden.' });
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
  }, [refreshKey]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setMode('create');
    setMessage(null);
  };

  const openEdit = (advertiser: AdvertiserRow) => {
    setForm({
      id: advertiser.id,
      companyName: advertiser.companyName,
      contactName: advertiser.contactName,
      email: advertiser.email,
      websiteUrl: advertiser.websiteUrl ?? '',
      description: advertiser.description ?? '',
      status: advertiser.status,
    });
    setMode('edit');
    setMessage(null);
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);

    const payload = {
      ...(mode === 'edit' ? { id: form.id, status: form.status } : {}),
      companyName: form.companyName,
      contactName: form.contactName,
      email: form.email,
      websiteUrl: form.websiteUrl,
      description: form.description,
    };

    try {
      const response = await fetch('/api/admin/advertising/advertisers', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { message?: string; issues?: { path: string; message: string }[] };

      if (!response.ok) {
        const detail = data.issues?.map((issue) => issue.message).join(' ');
        setMessage({
          tone: 'error',
          text: detail || data.message || 'Speichern fehlgeschlagen.',
        });
        return;
      }

      setMessage({
        tone: 'success',
        text: mode === 'edit' ? 'Werbepartner aktualisiert.' : 'Werbepartner angelegt.',
      });
      setMode('closed');
      setForm(EMPTY_FORM);
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler beim Speichern.' });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (advertiser: AdvertiserRow, status: AdvertiserStatus) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/advertising/advertisers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: advertiser.id, status }),
      });

      if (!response.ok) {
        setMessage({ tone: 'error', text: 'Statusänderung fehlgeschlagen.' });
        return;
      }

      setMessage({
        tone: 'success',
        text: `Status von ${advertiser.companyName} auf „${ADVERTISER_STATUS[status]?.label ?? status}“ gesetzt.`,
      });
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler bei der Statusänderung.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Werbepartner"
        description="Unternehmen verwalten, die Werbung buchen — inklusive Kampagnenzahl und Freigabestatus."
        icon={<MailIcon className="h-6 w-6" />}
        actions={
          <Button size="sm" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" />
            Neuer Werbepartner
          </Button>
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {mode !== 'closed' ? (
        <Panel
          title={mode === 'edit' ? 'Werbepartner bearbeiten' : 'Neuer Werbepartner'}
          description="Pflichtfelder sind Unternehmensname, Ansprechpartner und E-Mail-Adresse."
          action={
            <Button variant="ghost" size="sm" onClick={() => setMode('closed')}>
              Abbrechen
            </Button>
          }
        >
          <div className="space-y-4">
            <FormGrid>
              <Field id="advertiser-company" label="Unternehmen *">
                <input
                  id="advertiser-company"
                  className={fieldClass}
                  value={form.companyName}
                  onChange={(event) => update('companyName', event.target.value)}
                />
              </Field>
              <Field id="advertiser-contact" label="Ansprechpartner *">
                <input
                  id="advertiser-contact"
                  className={fieldClass}
                  value={form.contactName}
                  onChange={(event) => update('contactName', event.target.value)}
                />
              </Field>
              <Field id="advertiser-email" label="E-Mail *">
                <input
                  id="advertiser-email"
                  type="email"
                  className={fieldClass}
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                />
              </Field>
              <Field id="advertiser-website" label="Website" hint="Nur http(s):// ist erlaubt.">
                <input
                  id="advertiser-website"
                  className={fieldClass}
                  value={form.websiteUrl}
                  onChange={(event) => update('websiteUrl', event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              {mode === 'edit' ? (
                <Field id="advertiser-status" label="Status">
                  <select
                    id="advertiser-status"
                    className={fieldClass}
                    value={form.status}
                    onChange={(event) =>
                      update('status', event.target.value as AdvertiserStatus)
                    }
                  >
                    {Object.entries(ADVERTISER_STATUS).map(([value, entry]) => (
                      <option key={value} value={value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field id="advertiser-description" label="Beschreibung" className="sm:col-span-2">
                <textarea
                  id="advertiser-description"
                  rows={3}
                  className={fieldClass}
                  value={form.description}
                  onChange={(event) => update('description', event.target.value)}
                />
              </Field>
            </FormGrid>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={submit}>
                {busy ? 'Speichern…' : mode === 'edit' ? 'Änderungen speichern' : 'Anlegen'}
              </Button>
              <Button variant="secondary" onClick={() => setMode('closed')}>
                Abbrechen
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-500">Werbepartner werden geladen…</p>
      ) : (
        <TableShell caption="Werbepartner" minWidth="min-w-[46rem]">
          <TableHead>
            <Th>Unternehmen</Th>
            <Th>Kontakt</Th>
            <Th>Status</Th>
            <Th>Kampagnen</Th>
            <Th>Angelegt</Th>
            <Th align="right">Aktionen</Th>
          </TableHead>
          <tbody className="divide-y divide-zinc-800">
            {advertisers.length === 0 ? (
              <EmptyRow colSpan={6}>
                Noch keine Werbepartner. Lege den ersten Werbepartner über „Neuer Werbepartner“ an.
              </EmptyRow>
            ) : (
              advertisers.map((advertiser) => (
                <tr key={advertiser.id} className="hover:bg-zinc-800/30">
                  <Td>
                    <span className="font-semibold text-white">{advertiser.companyName}</span>
                    {advertiser.websiteUrl ? (
                      <a
                        href={advertiser.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block text-xs text-violet-300 hover:text-violet-200"
                      >
                        {advertiser.websiteUrl.replace(/^https?:\/\//, '')}
                      </a>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="block text-zinc-300">{advertiser.contactName}</span>
                    <span className="block text-xs text-zinc-500">{advertiser.email}</span>
                  </Td>
                  <Td>
                    <StatusBadge map={ADVERTISER_STATUS} status={advertiser.status} />
                  </Td>
                  <Td>
                    <Badge tone={advertiser.campaignCount > 0 ? 'accent' : 'neutral'}>
                      {advertiser.campaignCount}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-zinc-500">{formatDate(advertiser.createdAt)}</Td>
                  <Td align="right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        className={smallButtonClass}
                        onClick={() => openEdit(advertiser)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className={smallButtonClass}
                        disabled={busy}
                        onClick={() =>
                          setStatus(advertiser, advertiser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
                        }
                      >
                        {advertiser.status === 'ACTIVE' ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
