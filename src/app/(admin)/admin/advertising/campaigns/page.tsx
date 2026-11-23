'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import DashboardPageHeader from '@/components/dashboard/DashboardPageHeader';
import {
  EmptyRow,
  Field,
  FormGrid,
  Notice,
  Panel,
  StatCard,
  StatusBadge,
  TableHead,
  TableShell,
  Td,
  Th,
  fieldClass,
  smallButtonClass,
} from '@/components/admin/portal-ui';
import { CAMPAIGN_STATUS, FORMAT_LABELS, PLACEMENT_LABELS } from '@/lib/advertising/labels';
import { CAMPAIGN_STATUS_TRANSITIONS } from '@/lib/advertising/validations';
import { formatDate } from '@/lib/format';
import { CalendarIcon, LayersIcon, PlusIcon } from '@/components/ui/icons';

type CampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED';

type CampaignRow = {
  id: string;
  advertiserId: string | null;
  partnerId: string | null;
  name: string;
  description: string | null;
  placement: string;
  format: string;
  startDate: string;
  endDate: string;
  targetUrl: string;
  status: CampaignStatus;
  internalNotes: string | null;
  advertiser: { companyName: string } | null;
};

type AdvertiserOption = { id: string; companyName: string; status: string };
type PartnerOption = { id: string; companyName: string; status: string };

type Stats = { totalImpressions: number; totalClicks: number; ctr: number };

type FormState = {
  id: string;
  advertiserId: string;
  partnerId: string;
  name: string;
  description: string;
  placement: string;
  format: string;
  startDate: string;
  endDate: string;
  targetUrl: string;
  internalNotes: string;
  status: CampaignStatus;
};

const EMPTY_FORM: FormState = {
  id: '',
  advertiserId: '',
  partnerId: '',
  name: '',
  description: '',
  placement: 'HOMEPAGE',
  format: 'BANNER',
  startDate: '',
  endDate: '',
  targetUrl: '',
  internalNotes: '',
  status: 'DRAFT',
};

const ACTION_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Zur Freigabe',
  SCHEDULED: 'Einplanen',
  ACTIVE: 'Starten',
  PAUSED: 'Pausieren',
  COMPLETED: 'Abschließen',
  REJECTED: 'Ablehnen',
  DRAFT: 'Zurück zu Entwurf',
};

function toDateInput(value: string | null): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [advertisers, setAdvertisers] = useState<AdvertiserOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/api/admin/advertising/campaigns'),
      fetch('/api/admin/advertising/advertisers'),
      fetch('/api/admin/partners'),
    ])
      .then(
        ([campaignResponse, advertiserResponse, partnerResponse]) =>
          Promise.all([
            campaignResponse.json() as Promise<{ campaigns?: CampaignRow[] }>,
            advertiserResponse.json() as Promise<{ advertisers?: AdvertiserOption[] }>,
            partnerResponse.json() as Promise<{ partners?: PartnerOption[] }>,
          ]),
      )
      .then(([campaignData, advertiserData, partnerData]) => {
        if (cancelled) {
          return;
        }
        setCampaigns(campaignData.campaigns ?? []);
        setAdvertisers(advertiserData.advertisers ?? []);
        setPartners(partnerData.partners ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ tone: 'error', text: 'Kampagnen konnten nicht geladen werden.' });
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
    setForm({ ...EMPTY_FORM, advertiserId: advertisers[0]?.id ?? '' });
    setMode('create');
    setMessage(null);
  };

  const openEdit = (campaign: CampaignRow) => {
    setForm({
      id: campaign.id,
      advertiserId: campaign.advertiserId ?? '',
      partnerId: campaign.partnerId ?? '',
      name: campaign.name,
      description: campaign.description ?? '',
      placement: campaign.placement,
      format: campaign.format,
      startDate: toDateInput(campaign.startDate),
      endDate: toDateInput(campaign.endDate),
      targetUrl: campaign.targetUrl,
      internalNotes: campaign.internalNotes ?? '',
      status: campaign.status,
    });
    setMode('edit');
    setMessage(null);
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);

    const payload = {
      ...(mode === 'edit' ? { id: form.id } : {}),
      advertiserId: form.advertiserId,
      partnerId: form.partnerId || null,
      name: form.name,
      description: form.description,
      placement: form.placement,
      format: form.format,
      startDate: form.startDate,
      endDate: form.endDate,
      targetUrl: form.targetUrl,
      internalNotes: form.internalNotes,
    };

    try {
      const response = await fetch('/api/admin/advertising/campaigns', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        message?: string;
        issues?: { path: string; message: string }[];
      };

      if (!response.ok) {
        // The schema messages already name the field in German
        // ("Enddatum muss nach Startdatum liegen"), so no raw path prefix.
        const detail = data.issues?.map((issue) => issue.message).join(' ');
        setMessage({ tone: 'error', text: detail || data.message || 'Speichern fehlgeschlagen.' });
        return;
      }

      setMessage({
        tone: 'success',
        text: mode === 'edit' ? 'Kampagne aktualisiert.' : 'Kampagne angelegt (Status: Entwurf).',
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

  const changeStatus = async (campaign: CampaignRow, status: CampaignStatus) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/advertising/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaign.id, status }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? 'Statuswechsel fehlgeschlagen.' });
        return;
      }

      setMessage({
        tone: 'success',
        text: `${campaign.name}: Status „${CAMPAIGN_STATUS[status]?.label ?? status}“.`,
      });
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler beim Statuswechsel.' });
    } finally {
      setBusy(false);
    }
  };

  const showStats = async (campaign: CampaignRow) => {
    setStatsFor(campaign.id);
    setStats(null);
    try {
      const response = await fetch(`/api/admin/advertising/campaigns/${campaign.id}/stats`);
      const data = (await response.json()) as { stats?: Stats; message?: string };
      setStats(data.stats ?? null);
    } catch {
      setStats(null);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Kampagnen"
        description="Kampagnen anlegen, Werbepartner und Partnern zuordnen, Status steuern und Leistung prüfen."
        icon={<CalendarIcon className="h-6 w-6" />}
        actions={
          <>
            <Link
              href="/admin/advertising/creatives"
              className="rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08]"
            >
              Werbemittel
            </Link>
            <Link
              href="/admin/advertising/placements"
              className="rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08]"
            >
              Platzierungen
            </Link>
            <Button size="sm" onClick={openCreate} disabled={advertisers.length === 0}>
              <PlusIcon className="h-4 w-4" />
              Neue Kampagne
            </Button>
          </>
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {advertisers.length === 0 && !loading ? (
        <Notice tone="info">
          Für eine Kampagne wird zuerst ein Werbepartner benötigt. Lege ihn unter
          <Link href="/admin/advertising/advertisers" className="ml-1 text-violet-300 hover:text-violet-200">
            Werbepartner
          </Link>
          an.
        </Notice>
      ) : null}

      {mode !== 'closed' ? (
        <Panel
          title={mode === 'edit' ? 'Kampagne bearbeiten' : 'Neue Kampagne'}
          description="Der Status startet als Entwurf und wird anschließend über die Statusspalte gesteuert."
          action={
            <Button variant="ghost" size="sm" onClick={() => setMode('closed')}>
              Abbrechen
            </Button>
          }
        >
          <div className="space-y-4">
            <FormGrid>
              <Field id="campaign-name" label="Name *">
                <input
                  id="campaign-name"
                  className={fieldClass}
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              </Field>
              <Field id="campaign-advertiser" label="Werbepartner *">
                <select
                  id="campaign-advertiser"
                  className={fieldClass}
                  value={form.advertiserId}
                  onChange={(event) => update('advertiserId', event.target.value)}
                >
                  <option value="">Bitte wählen…</option>
                  {advertisers.map((advertiser) => (
                    <option key={advertiser.id} value={advertiser.id}>
                      {advertiser.companyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="campaign-partner" label="Partner (optional)">
                <select
                  id="campaign-partner"
                  className={fieldClass}
                  value={form.partnerId}
                  onChange={(event) => update('partnerId', event.target.value)}
                >
                  <option value="">Kein Partner</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.companyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="campaign-placement" label="Platzierung *">
                <select
                  id="campaign-placement"
                  className={fieldClass}
                  value={form.placement}
                  onChange={(event) => update('placement', event.target.value)}
                >
                  {Object.entries(PLACEMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="campaign-format" label="Werbeform *">
                <select
                  id="campaign-format"
                  className={fieldClass}
                  value={form.format}
                  onChange={(event) => update('format', event.target.value)}
                >
                  {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="campaign-target" label="Ziel-URL *" hint="Nur http(s):// ist erlaubt.">
                <input
                  id="campaign-target"
                  className={fieldClass}
                  value={form.targetUrl}
                  onChange={(event) => update('targetUrl', event.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field id="campaign-start" label="Startdatum *">
                <input
                  id="campaign-start"
                  type="date"
                  className={fieldClass}
                  value={form.startDate}
                  onChange={(event) => update('startDate', event.target.value)}
                />
              </Field>
              <Field id="campaign-end" label="Enddatum *">
                <input
                  id="campaign-end"
                  type="date"
                  className={fieldClass}
                  value={form.endDate}
                  onChange={(event) => update('endDate', event.target.value)}
                />
              </Field>
              <Field id="campaign-description" label="Beschreibung" className="sm:col-span-2">
                <textarea
                  id="campaign-description"
                  rows={2}
                  className={fieldClass}
                  value={form.description}
                  onChange={(event) => update('description', event.target.value)}
                />
              </Field>
              <Field id="campaign-notes" label="Interne Notizen" className="sm:col-span-2">
                <textarea
                  id="campaign-notes"
                  rows={2}
                  className={fieldClass}
                  value={form.internalNotes}
                  onChange={(event) => update('internalNotes', event.target.value)}
                />
              </Field>
            </FormGrid>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={submit}>
                {busy ? 'Speichern…' : mode === 'edit' ? 'Änderungen speichern' : 'Kampagne anlegen'}
              </Button>
              <Button variant="secondary" onClick={() => setMode('closed')}>
                Abbrechen
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-500">Kampagnen werden geladen…</p>
      ) : (
        <TableShell caption="Kampagnen" minWidth="min-w-[58rem]">
          <TableHead>
            <Th>Kampagne</Th>
            <Th>Zuordnung</Th>
            <Th>Platzierung</Th>
            <Th>Zeitraum</Th>
            <Th>Status</Th>
            <Th align="right">Aktionen</Th>
          </TableHead>
          <tbody className="divide-y divide-zinc-800">
            {campaigns.length === 0 ? (
              <EmptyRow colSpan={6}>
                Noch keine Kampagnen. Lege über „Neue Kampagne“ die erste an.
              </EmptyRow>
            ) : (
              campaigns.map((campaign) => {
                const partner = partners.find((entry) => entry.id === campaign.partnerId);
                const transitions = CAMPAIGN_STATUS_TRANSITIONS[campaign.status];

                return (
                  <tr key={campaign.id} className="hover:bg-zinc-800/30">
                    <Td>
                      <span className="font-semibold text-white">{campaign.name}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {FORMAT_LABELS[campaign.format as keyof typeof FORMAT_LABELS] ??
                          campaign.format}
                      </span>
                    </Td>
                    <Td className="text-zinc-300">
                      <span className="block">{campaign.advertiser?.companyName ?? '—'}</span>
                      {partner ? (
                        <span className="text-xs text-zinc-500">Partner: {partner.companyName}</span>
                      ) : null}
                    </Td>
                    <Td className="text-zinc-400">
                      {PLACEMENT_LABELS[campaign.placement as keyof typeof PLACEMENT_LABELS] ??
                        campaign.placement}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-zinc-400">
                      {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
                    </Td>
                    <Td>
                      <StatusBadge map={CAMPAIGN_STATUS} status={campaign.status} />
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {transitions.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={smallButtonClass}
                            disabled={busy}
                            onClick={() => changeStatus(campaign, status)}
                          >
                            {ACTION_LABELS[status] ?? status}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={smallButtonClass}
                          onClick={() => showStats(campaign)}
                        >
                          Statistik
                        </button>
                        <button
                          type="button"
                          className={smallButtonClass}
                          onClick={() => openEdit(campaign)}
                        >
                          Bearbeiten
                        </button>
                        <Link
                          href={`/admin/advertising/creatives?campaignId=${campaign.id}`}
                          className={smallButtonClass}
                        >
                          Werbemittel
                        </Link>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      )}

      {statsFor ? (
        <Panel
          title="Kampagnenstatistik"
          description="Impressionen und Klicks aus den täglichen Aggregaten."
          action={
            <Button variant="ghost" size="sm" onClick={() => setStatsFor(null)}>
              Schließen
            </Button>
          }
        >
          {stats ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatCard value={stats.totalImpressions} label="Impressionen" />
              <StatCard value={stats.totalClicks} label="Klicks" />
              <StatCard value={`${stats.ctr.toFixed(1)} %`} label="CTR" />
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Statistik wird geladen…</p>
          )}
        </Panel>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <LayersIcon className="h-3.5 w-3.5" />
        Statuswechsel werden im Audit-Protokoll festgehalten.
      </p>
    </div>
  );
}
