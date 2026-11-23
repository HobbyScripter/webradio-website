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
  TableHead,
  TableShell,
  Td,
  Th,
  fieldClass,
  smallButtonClass,
} from '@/components/admin/portal-ui';
import { formatDateTime, formatFileSize } from '@/lib/format';
import { PackageIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';

type CampaignOption = { id: string; name: string };

type CreativeRow = {
  id: string;
  campaignId: string;
  imageUrl: string;
  altText: string | null;
  width: number;
  height: number;
  fileSize: number;
  contentType: string;
  createdAt: string;
};

type FormState = {
  campaignId: string;
  imageUrl: string;
  altText: string;
  width: string;
  height: string;
  fileSize: string;
  contentType: string;
};

const EMPTY_FORM: FormState = {
  campaignId: '',
  imageUrl: '',
  altText: '',
  width: '728',
  height: '90',
  fileSize: '0',
  contentType: 'image/png',
};

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  // A campaign link carries the campaign to preselect ($preset, read once).
  const [preset] = useState(() => {
    if (typeof window === 'undefined') {
      return { campaignId: '', open: false };
    }
    const value = new URLSearchParams(window.location.search).get('campaignId') ?? '';
    return { campaignId: value, open: Boolean(value) };
  });
  const [showForm, setShowForm] = useState(preset.open);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, campaignId: preset.campaignId });
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/api/admin/advertising/creatives'),
      fetch('/api/admin/advertising/campaigns'),
    ])
      .then(([creativeResponse, campaignResponse]) =>
        Promise.all([
          creativeResponse.json() as Promise<{ creatives?: CreativeRow[] }>,
          campaignResponse.json() as Promise<{ campaigns?: CampaignOption[] }>,
        ]),
      )
      .then(([creativeData, campaignData]) => {
        if (cancelled) {
          return;
        }
        setCreatives(creativeData.creatives ?? []);
        setCampaigns(campaignData.campaigns ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ tone: 'error', text: 'Werbemittel konnten nicht geladen werden.' });
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

  const update = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/advertising/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: form.campaignId,
          imageUrl: form.imageUrl,
          altText: form.altText,
          width: Number(form.width),
          height: Number(form.height),
          fileSize: Number(form.fileSize),
          contentType: form.contentType,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        issues?: { path: string; message: string }[];
      };

      if (!response.ok) {
        const detail = data.issues?.map((issue) => issue.message).join(' ');
        setMessage({ tone: 'error', text: detail || data.message || 'Speichern fehlgeschlagen.' });
        return;
      }

      setMessage({ tone: 'success', text: 'Werbemittel angelegt.' });
      setForm({ ...EMPTY_FORM, campaignId: form.campaignId });
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler beim Speichern.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (creative: CreativeRow) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/advertising/creatives?id=${encodeURIComponent(creative.id)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        setMessage({ tone: 'error', text: 'Werbemittel konnte nicht gelöscht werden.' });
        return;
      }
      setMessage({ tone: 'success', text: 'Werbemittel gelöscht.' });
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler beim Löschen.' });
    } finally {
      setBusy(false);
    }
  };

  const campaignName = (id: string) =>
    campaigns.find((campaign) => campaign.id === id)?.name ?? 'Unbekannte Kampagne';

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Werbemittel"
        description="Anzeigenmotive je Kampagne verwalten: Bild-URL, Maße, Dateigröße und Alternativtext."
        icon={<PackageIcon className="h-6 w-6" />}
        actions={
          <Button size="sm" onClick={() => setShowForm((value) => !value)}>
            <PlusIcon className="h-4 w-4" />
            Werbemittel hinzufügen
          </Button>
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {showForm ? (
        <Panel
          title="Neues Werbemittel"
          description="Die Bilddatei liegt extern; hier werden URL und Metadaten hinterlegt."
          action={
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Schließen
            </Button>
          }
        >
          <div className="space-y-4">
            <FormGrid>
              <Field id="creative-campaign" label="Kampagne *">
                <select
                  id="creative-campaign"
                  className={fieldClass}
                  value={form.campaignId}
                  onChange={(event) => update('campaignId', event.target.value)}
                >
                  <option value="">Bitte wählen…</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="creative-url" label="Bild-URL *" hint="Nur http(s):// ist erlaubt.">
                <input
                  id="creative-url"
                  className={fieldClass}
                  value={form.imageUrl}
                  onChange={(event) => update('imageUrl', event.target.value)}
                  placeholder="https://…/banner.png"
                />
              </Field>
              <Field id="creative-alt" label="Alternativtext">
                <input
                  id="creative-alt"
                  className={fieldClass}
                  value={form.altText}
                  onChange={(event) => update('altText', event.target.value)}
                />
              </Field>
              <Field id="creative-type" label="Content-Type *">
                <input
                  id="creative-type"
                  className={fieldClass}
                  value={form.contentType}
                  onChange={(event) => update('contentType', event.target.value)}
                  placeholder="image/png"
                />
              </Field>
              <Field id="creative-width" label="Breite (px) *">
                <input
                  id="creative-width"
                  type="number"
                  min={1}
                  className={fieldClass}
                  value={form.width}
                  onChange={(event) => update('width', event.target.value)}
                />
              </Field>
              <Field id="creative-height" label="Höhe (px) *">
                <input
                  id="creative-height"
                  type="number"
                  min={1}
                  className={fieldClass}
                  value={form.height}
                  onChange={(event) => update('height', event.target.value)}
                />
              </Field>
              <Field id="creative-size" label="Dateigröße (Byte) *">
                <input
                  id="creative-size"
                  type="number"
                  min={0}
                  className={fieldClass}
                  value={form.fileSize}
                  onChange={(event) => update('fileSize', event.target.value)}
                />
              </Field>
            </FormGrid>
            <div className="flex gap-2">
              <Button disabled={busy || campaigns.length === 0} onClick={submit}>
                {busy ? 'Speichern…' : 'Werbemittel anlegen'}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-500">Werbemittel werden geladen…</p>
      ) : (
        <TableShell caption="Werbemittel" minWidth="min-w-[52rem]">
          <TableHead>
            <Th>Kampagne</Th>
            <Th>Bild</Th>
            <Th>Maße</Th>
            <Th>Datei</Th>
            <Th>Angelegt</Th>
            <Th align="right">Aktionen</Th>
          </TableHead>
          <tbody className="divide-y divide-zinc-800">
            {creatives.length === 0 ? (
              <EmptyRow colSpan={6}>
                Noch keine Werbemittel hinterlegt. Ohne Motiv wird für eine Kampagne nichts
                ausgeliefert.
              </EmptyRow>
            ) : (
              creatives.map((creative) => (
                <tr key={creative.id} className="hover:bg-zinc-800/30">
                  <Td className="text-zinc-300">{campaignName(creative.campaignId)}</Td>
                  <Td>
                    <a
                      href={creative.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-[22rem] truncate text-xs text-violet-300 hover:text-violet-200"
                    >
                      {creative.imageUrl}
                    </a>
                    {creative.altText ? (
                      <span className="mt-0.5 block text-xs text-zinc-500">{creative.altText}</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-400">
                    {creative.width} × {creative.height}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-400">
                    {formatFileSize(creative.fileSize) ?? '—'}
                    <span className="mt-0.5 block text-zinc-500">{creative.contentType}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-500">
                    {formatDateTime(creative.createdAt)}
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      className={`${smallButtonClass} text-rose-300 hover:bg-rose-500/10 hover:text-rose-200`}
                      disabled={busy}
                      onClick={() => remove(creative)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Löschen
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <p className="text-xs text-zinc-500">
        Kampagnen ohne Werbemittel erscheinen nicht auf der Website.{' '}
        <Link href="/admin/advertising/campaigns" className="text-violet-300 hover:text-violet-200">
          Zurück zu den Kampagnen
        </Link>
      </p>
    </div>
  );
}
