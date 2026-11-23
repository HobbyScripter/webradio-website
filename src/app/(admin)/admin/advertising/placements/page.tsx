'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardPageHeader from '@/components/dashboard/DashboardPageHeader';
import { Notice, StatCard } from '@/components/admin/portal-ui';
import { CAMPAIGN_STATUS, PLACEMENT_LABELS } from '@/lib/advertising/labels';
import { formatDate } from '@/lib/format';
import { GlobeIcon } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';

type PlacementRow = {
  placement: string;
  totalCampaigns: number;
  activeCampaigns: number;
  creativeCount: number;
};

type CampaignRow = {
  id: string;
  name: string;
  placement: string;
  status: string;
  startDate: string;
  endDate: string;
};

export default function PlacementsPage() {
  const [placements, setPlacements] = useState<PlacementRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch('/api/admin/advertising/placements'),
      fetch('/api/admin/advertising/campaigns'),
    ])
      .then(([placementResponse, campaignResponse]) =>
        Promise.all([
          placementResponse.json() as Promise<{ placements?: PlacementRow[] }>,
          campaignResponse.json() as Promise<{ campaigns?: CampaignRow[] }>,
        ]),
      )
      .then(([placementData, campaignData]) => {
        if (cancelled) {
          return;
        }
        setPlacements(placementData.placements ?? []);
        setCampaigns(campaignData.campaigns ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Platzierungen konnten nicht geladen werden.');
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
  }, []);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Platzierungen"
        description="Wo Werbung ausgeliefert wird: Startseite, Download-Seite und öffentliche Informationsseiten."
        icon={<GlobeIcon className="h-6 w-6" />}
      />

      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-500">Platzierungen werden geladen…</p>
      ) : (
        <div className="space-y-5">
          {placements.map((placement) => {
            const inPlacement = campaigns.filter(
              (campaign) => campaign.placement === placement.placement,
            );

            return (
              <section
                key={placement.placement}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6"
              >
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      {PLACEMENT_LABELS[placement.placement as keyof typeof PLACEMENT_LABELS] ??
                        placement.placement}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">{placement.placement}</p>
                  </div>
                  <Badge tone={placement.activeCampaigns > 0 ? 'success' : 'neutral'}>
                    {placement.activeCampaigns > 0
                      ? `${placement.activeCampaigns} live`
                      : 'Keine Live-Kampagne'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <StatCard value={placement.totalCampaigns} label="Kampagnen" />
                  <StatCard value={placement.activeCampaigns} label="Aktuell live" />
                  <StatCard value={placement.creativeCount} label="Werbemittel" />
                </div>

                {inPlacement.length > 0 ? (
                  <ul className="mt-4 divide-y divide-zinc-800 text-sm">
                    {inPlacement.map((campaign) => (
                      <li
                        key={campaign.id}
                        className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <Link
                          href={`/admin/advertising/creatives?campaignId=${campaign.id}`}
                          className="font-medium text-zinc-200 hover:text-violet-300"
                        >
                          {campaign.name}
                        </Link>
                        <span className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                          <span>
                            {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}
                          </span>
                          <Badge tone={CAMPAIGN_STATUS[campaign.status]?.tone ?? 'neutral'}>
                            {CAMPAIGN_STATUS[campaign.status]?.label ?? campaign.status}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-zinc-400">
                    Keine Kampagne für diese Platzierung.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Platzierungen sind feste Werbeflächen der Website. Kampagnen werden ihnen bei der Anlage
        zugeordnet.
      </p>
    </div>
  );
}
