'use client';

import { useEffect, useState } from 'react';
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
import { PARTNER_STATUS, RELATIONSHIP_STATUS, RELATIONSHIP_TYPE } from '@/lib/advertising/labels';
import { calculateDuration, earliestRelationshipStart } from '@/lib/partner/duration';
import { formatDate, formatDateTime } from '@/lib/format';
import { GlobeIcon } from '@/components/ui/icons';

type PartnerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
type RelationshipStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

type RelationshipRow = {
  id: string;
  partnerId: string;
  type: string;
  startDate: string;
  endDate: string | null;
  status: RelationshipStatus;
  isPublic: boolean;
};

type PartnerRow = {
  id: string;
  companyName: string;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
  status: PartnerStatus;
  relationships: RelationshipRow[];
};

type HistoryEntry = {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
};

type PartnerForm = {
  id: string;
  companyName: string;
  description: string;
  websiteUrl: string;
  logoUrl: string;
  isFeatured: boolean;
  status: PartnerStatus;
};

type RelationshipForm = {
  partnerId: string;
  type: string;
  startDate: string;
  endDate: string;
  isPublic: boolean;
};

const RELATIONSHIP_TYPES = ['OFFICIAL_PARTNER', 'SPONSOR', 'TECHNICAL_PARTNER', 'MEDIA_PARTNER', 'STRATEGIC_PARTNER'];

export default function PartnersAdminPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PartnerForm | null>(null);
  const [relationshipForm, setRelationshipForm] = useState<RelationshipForm | null>(null);
  const [historyFor, setHistoryFor] = useState<{ partner: PartnerRow; entries: HistoryEntry[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/admin/partners')
      .then((response) => response.json() as Promise<{ partners?: PartnerRow[] }>)
      .then((data) => {
        if (!cancelled) {
          setPartners(data.partners ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ tone: 'error', text: 'Partner konnten nicht geladen werden.' });
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

  const openEdit = (partner: PartnerRow) => {
    setEditing({
      id: partner.id,
      companyName: partner.companyName,
      description: partner.description ?? '',
      websiteUrl: partner.websiteUrl ?? '',
      logoUrl: partner.logoUrl ?? '',
      isFeatured: partner.isFeatured,
      status: partner.status,
    });
    setRelationshipForm(null);
    setMessage(null);
  };

  const savePartner = async () => {
    if (!editing) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/partners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          companyName: editing.companyName,
          description: editing.description,
          websiteUrl: editing.websiteUrl,
          logoUrl: editing.logoUrl,
          isFeatured: editing.isFeatured,
          status: editing.status,
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

      setMessage({ tone: 'success', text: 'Partner gespeichert.' });
      setEditing(null);
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler beim Speichern.' });
    } finally {
      setBusy(false);
    }
  };

  const patchRelationship = async (
    relationship: RelationshipRow,
    changes: { status?: RelationshipStatus; isPublic?: boolean; endDate?: string | null },
    successText: string,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/partners/relationships', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: relationship.id, ...changes }),
      });

      if (!response.ok) {
        setMessage({ tone: 'error', text: 'Beziehung konnte nicht geändert werden.' });
        return;
      }

      setMessage({ tone: 'success', text: successText });
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler bei der Beziehung.' });
    } finally {
      setBusy(false);
    }
  };

  const addRelationship = async () => {
    if (!relationshipForm) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/partners/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: relationshipForm.partnerId,
          type: relationshipForm.type,
          startDate: relationshipForm.startDate,
          endDate: relationshipForm.endDate || null,
          isPublic: relationshipForm.isPublic,
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? 'Beziehung konnte nicht angelegt werden.' });
        return;
      }

      setMessage({ tone: 'success', text: 'Beziehung angelegt.' });
      setRelationshipForm(null);
      reload();
    } catch {
      setMessage({ tone: 'error', text: 'Netzwerkfehler beim Anlegen der Beziehung.' });
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (partner: PartnerRow) => {
    try {
      const response = await fetch(`/api/admin/partners/${partner.id}/history`);
      const data = (await response.json()) as { history?: HistoryEntry[] };
      setHistoryFor({ partner, entries: data.history ?? [] });
    } catch {
      setMessage({ tone: 'error', text: 'Historie konnte nicht geladen werden.' });
    }
  };

  const activeCount = partners.filter((partner) => partner.status === 'ACTIVE').length;
  const featuredCount = partners.filter(
    (partner) => partner.status === 'ACTIVE' && partner.isFeatured,
  ).length;
  const publicRelationshipCount = partners.reduce(
    (sum, partner) =>
      sum + partner.relationships.filter((entry) => entry.status === 'ACTIVE' && entry.isPublic).length,
    0,
  );

  const editingPartner = editing ? partners.find((partner) => partner.id === editing.id) ?? null : null;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Partner & Sponsoren"
        description="Partnerdaten pflegen, Beziehungsarten steuern und die öffentliche Sichtbarkeit festlegen."
        icon={<GlobeIcon className="h-6 w-6" />}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard value={activeCount} label="Aktive Partner" />
        <StatCard value={featuredCount} label="Hauptpartner" />
        <StatCard value={partners.length} label="Partner gesamt" />
        <StatCard value={publicRelationshipCount} label="Öffentliche Beziehungen" />
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-500">Partner werden geladen…</p>
      ) : (
        <TableShell caption="Partner und Sponsoren" minWidth="min-w-[52rem]">
          <TableHead>
            <Th>Unternehmen</Th>
            <Th>Status</Th>
            <Th>Beziehungen</Th>
            <Th>Partner seit</Th>
            <Th>Dauer</Th>
            <Th align="right">Aktionen</Th>
          </TableHead>
          <tbody className="divide-y divide-zinc-800">
            {partners.length === 0 ? (
              <EmptyRow colSpan={6}>
                Noch keine Partner erfasst. Partner werden über die Partner-API angelegt und
                erscheinen danach hier.
              </EmptyRow>
            ) : (
              partners.map((partner) => {
                const start = earliestRelationshipStart(partner.relationships);
                const duration = start ? calculateDuration(start) : null;

                return (
                  <tr key={partner.id} className="hover:bg-zinc-800/30">
                    <Td>
                      <span className="font-semibold text-white">{partner.companyName}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1 text-xs text-zinc-500">
                        {partner.isFeatured ? <span className="text-amber-300">Hauptpartner</span> : null}
                        {partner.websiteUrl ? (
                          <a
                            href={partner.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-300 hover:text-violet-200"
                          >
                            Website
                          </a>
                        ) : null}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge map={PARTNER_STATUS} status={partner.status} />
                    </Td>
                    <Td className="text-zinc-300">{partner.relationships.length}</Td>
                    <Td className="whitespace-nowrap text-xs text-zinc-400">
                      {start ? formatDate(start) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-zinc-400">{duration ?? '—'}</Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          className={smallButtonClass}
                          onClick={() => openEdit(partner)}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className={smallButtonClass}
                          onClick={() => void openHistory(partner)}
                        >
                          Historie
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      )}

      {editing && editingPartner ? (
        <Panel
          title={`Partner bearbeiten: ${editing.companyName}`}
          description="Stammdaten, Freigabestatus und die einzelnen Beziehungsarten."
          action={
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Schließen
            </Button>
          }
        >
          <div className="space-y-6">
            <FormGrid>
              <Field id="partner-company" label="Unternehmen *">
                <input
                  id="partner-company"
                  className={fieldClass}
                  value={editing.companyName}
                  onChange={(event) =>
                    setEditing({ ...editing, companyName: event.target.value })
                  }
                />
              </Field>
              <Field id="partner-status" label="Status">
                <select
                  id="partner-status"
                  className={fieldClass}
                  value={editing.status}
                  onChange={(event) =>
                    setEditing({ ...editing, status: event.target.value as PartnerStatus })
                  }
                >
                  {Object.entries(PARTNER_STATUS).map(([value, entry]) => (
                    <option key={value} value={value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="partner-website" label="Website" hint="Nur http(s):// ist erlaubt.">
                <input
                  id="partner-website"
                  className={fieldClass}
                  value={editing.websiteUrl}
                  onChange={(event) =>
                    setEditing({ ...editing, websiteUrl: event.target.value })
                  }
                />
              </Field>
              <Field id="partner-logo" label="Logo-URL" hint="Nur http(s):// ist erlaubt.">
                <input
                  id="partner-logo"
                  className={fieldClass}
                  value={editing.logoUrl}
                  onChange={(event) => setEditing({ ...editing, logoUrl: event.target.value })}
                />
              </Field>
              <Field id="partner-description" label="Beschreibung" className="sm:col-span-2">
                <textarea
                  id="partner-description"
                  rows={3}
                  className={fieldClass}
                  value={editing.description}
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                />
              </Field>
            </FormGrid>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={editing.isFeatured}
                onChange={(event) =>
                  setEditing({ ...editing, isFeatured: event.target.checked })
                }
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-600"
              />
              Als Hauptpartner hervorheben
            </label>

            <div className="flex gap-2">
              <Button disabled={busy} onClick={savePartner}>
                {busy ? 'Speichern…' : 'Änderungen speichern'}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Abbrechen
              </Button>
            </div>

            <div className="border-t border-zinc-800 pt-5">
              <h3 className="text-sm font-semibold text-white">Beziehungen</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Ein Partner kann gleichzeitig mehrere Arten halten. Öffentlich sichtbar sind nur
                aktive und freigegebene Beziehungen.
              </p>

              <ul className="mt-3 space-y-2">
                {editingPartner.relationships.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-sm text-zinc-400">
                    Noch keine Beziehung. Der Partner erscheint erst nach dem Anlegen auf der Website.
                  </li>
                ) : (
                  editingPartner.relationships.map((relationship) => (
                    <li
                      key={relationship.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">
                            {RELATIONSHIP_TYPE[relationship.type] ?? relationship.type}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {formatDate(relationship.startDate)} –{' '}
                            {relationship.endDate ? formatDate(relationship.endDate) : 'laufend'}
                            {' · '}
                            {calculateDuration(relationship.startDate, relationship.endDate)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge map={RELATIONSHIP_STATUS} status={relationship.status} />
                          <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-zinc-300">
                            {relationship.isPublic ? 'öffentlich' : 'intern'}
                          </span>
                          <button
                            type="button"
                            className={smallButtonClass}
                            disabled={busy}
                            onClick={() =>
                              patchRelationship(
                                relationship,
                                { isPublic: !relationship.isPublic },
                                'Sichtbarkeit geändert.',
                              )
                            }
                          >
                            {relationship.isPublic ? 'Intern stellen' : 'Öffentlich machen'}
                          </button>
                          {relationship.status === 'ACTIVE' ? (
                            <>
                              <button
                                type="button"
                                className={smallButtonClass}
                                disabled={busy}
                                onClick={() =>
                                  patchRelationship(
                                    relationship,
                                    { status: 'PAUSED' },
                                    'Beziehung pausiert.',
                                  )
                                }
                              >
                                Pausieren
                              </button>
                              <button
                                type="button"
                                className={smallButtonClass}
                                disabled={busy}
                                onClick={() =>
                                  patchRelationship(
                                    relationship,
                                    {
                                      status: 'ENDED',
                                      endDate: new Date().toISOString().slice(0, 10),
                                    },
                                    'Beziehung beendet.',
                                  )
                                }
                              >
                                Beenden
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={smallButtonClass}
                              disabled={busy}
                              onClick={() =>
                                patchRelationship(
                                  relationship,
                                  { status: 'ACTIVE', endDate: null },
                                  'Beziehung reaktiviert.',
                                )
                              }
                            >
                              Reaktivieren
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>

              {relationshipForm && relationshipForm.partnerId === editingPartner.id ? (
                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <FormGrid>
                    <Field id="relationship-type" label="Beziehungsart">
                      <select
                        id="relationship-type"
                        className={fieldClass}
                        value={relationshipForm.type}
                        onChange={(event) =>
                          setRelationshipForm({ ...relationshipForm, type: event.target.value })
                        }
                      >
                        {RELATIONSHIP_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {RELATIONSHIP_TYPE[type] ?? type}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="relationship-start" label="Beginn *">
                      <input
                        id="relationship-start"
                        type="date"
                        className={fieldClass}
                        value={relationshipForm.startDate}
                        onChange={(event) =>
                          setRelationshipForm({
                            ...relationshipForm,
                            startDate: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field id="relationship-end" label="Ende (optional)">
                      <input
                        id="relationship-end"
                        type="date"
                        className={fieldClass}
                        value={relationshipForm.endDate}
                        onChange={(event) =>
                          setRelationshipForm({ ...relationshipForm, endDate: event.target.value })
                        }
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={relationshipForm.isPublic}
                        onChange={(event) =>
                          setRelationshipForm({
                            ...relationshipForm,
                            isPublic: event.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-600"
                      />
                      Öffentlich sichtbar
                    </label>
                  </FormGrid>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={busy || !relationshipForm.startDate} onClick={addRelationship}>
                      Beziehung anlegen
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRelationshipForm(null)}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-4"
                  onClick={() =>
                    setRelationshipForm({
                      partnerId: editingPartner.id,
                      type: 'OFFICIAL_PARTNER',
                      startDate: new Date().toISOString().slice(0, 10),
                      endDate: '',
                      isPublic: true,
                    })
                  }
                >
                  Beziehung hinzufügen
                </Button>
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      {historyFor ? (
        <Panel
          title={`Historie: ${historyFor.partner.companyName}`}
          description="Alle Änderungen mit Zeitpunkt und ausführendem Konto."
          action={
            <Button variant="ghost" size="sm" onClick={() => setHistoryFor(null)}>
              Schließen
            </Button>
          }
        >
          {historyFor.entries.length === 0 ? (
            <p className="text-sm text-zinc-400">Keine Historie verfügbar.</p>
          ) : (
            <ul className="space-y-2">
              {historyFor.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <p className="text-sm font-medium text-white">{entry.action}</p>
                  <p className="text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</p>
                  {entry.details ? (
                    <p className="mt-1 text-xs text-zinc-400">{entry.details}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
