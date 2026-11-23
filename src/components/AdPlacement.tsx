'use client';

import { useEffect, useState } from 'react';

interface AdCampaign {
  id: string;
  name: string;
  advertiser: { companyName: string; websiteUrl: string };
  creatives: { imageUrl: string; altText: string; width: number; height: number }[];
  targetUrl: string;
}

export function AdPlacement({ placement }: { placement: string }) {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/advertising/campaigns?placement=${placement}`)
      .then(res => res.json())
      .then(data => {
        setCampaigns(data.campaigns || []);
        // Record impressions for each campaign
        data.campaigns?.forEach((camp: AdCampaign) => {
          fetch('/api/advertising/impression', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: camp.id, placement }),
          });
        });
      })
      .finally(() => setLoading(false));
  }, [placement]);

  const handleClick = async (campaignId: string, targetUrl: string) => {
    await fetch('/api/advertising/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, placement }),
    });
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading || campaigns.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Werbung</div>
      {campaigns.map((campaign) => (
        <div key={campaign.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          {campaign.creatives.map((creative, idx) => (
            <div key={idx} className="relative">
              <a
                href={campaign.targetUrl}
                onClick={(e) => {
                  e.preventDefault();
                  handleClick(campaign.id, campaign.targetUrl);
                }}
                className="block"
              >
                <img
                  src={creative.imageUrl}
                  alt={creative.altText || `${campaign.advertiser.companyName} Werbung`}
                  width={creative.width}
                  height={creative.height}
                  className="rounded hover:opacity-90 transition-opacity"
                />
              </a>
            </div>
          ))}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Sponsored by {campaign.advertiser.companyName}
          </p>
        </div>
      ))}
    </div>
  );
}
