/**
 * Display labels for the advertising and partner domain.
 *
 * Pure data (no DB, no React) so the public pages, the admin pages and the tests
 * all use the same wording.
 */
import type { AdFormat, AdPlacementType } from './validations';

export const PLACEMENT_LABELS: Record<AdPlacementType, string> = {
  HOMEPAGE: 'Startseite',
  DOWNLOAD_PAGE: 'Download-Seite',
  PUBLIC_PAGES: 'Öffentliche Seiten',
};

export const FORMAT_LABELS: Record<AdFormat, string> = {
  BANNER: 'Banner',
  SPONSOR_CARD: 'Sponsorenkarte',
  LOGO_LINK: 'Logo-Link',
  CUSTOM: 'Individuelle Anfrage',
};

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'beta';

type StatusLabel = { label: string; tone: StatusTone };

export const APPLICATION_STATUS: Record<string, StatusLabel> = {
  PENDING: { label: 'Ausstehend', tone: 'warning' },
  UNDER_REVIEW: { label: 'In Prüfung', tone: 'beta' },
  APPROVED: { label: 'Genehmigt', tone: 'success' },
  REJECTED: { label: 'Abgelehnt', tone: 'danger' },
  WITHDRAWN: { label: 'Zurückgezogen', tone: 'neutral' },
};

export const ADVERTISER_STATUS: Record<string, StatusLabel> = {
  ACTIVE: { label: 'Aktiv', tone: 'success' },
  INACTIVE: { label: 'Inaktiv', tone: 'neutral' },
  SUSPENDED: { label: 'Gesperrt', tone: 'danger' },
  ARCHIVED: { label: 'Archiviert', tone: 'neutral' },
};

export const CAMPAIGN_STATUS: Record<string, StatusLabel> = {
  DRAFT: { label: 'Entwurf', tone: 'neutral' },
  PENDING_REVIEW: { label: 'Freigabe offen', tone: 'warning' },
  SCHEDULED: { label: 'Geplant', tone: 'beta' },
  ACTIVE: { label: 'Aktiv', tone: 'success' },
  PAUSED: { label: 'Pausiert', tone: 'warning' },
  COMPLETED: { label: 'Abgeschlossen', tone: 'accent' },
  REJECTED: { label: 'Abgelehnt', tone: 'danger' },
};

export const PARTNER_STATUS: Record<string, StatusLabel> = {
  ACTIVE: { label: 'Aktiv', tone: 'success' },
  INACTIVE: { label: 'Inaktiv', tone: 'neutral' },
  ARCHIVED: { label: 'Archiviert', tone: 'neutral' },
};

export const RELATIONSHIP_TYPE: Record<string, string> = {
  OFFICIAL_PARTNER: 'Offizieller Partner',
  TECHNICAL_PARTNER: 'Technischer Partner',
  SPONSOR: 'Sponsor',
  MEDIA_PARTNER: 'Medienpartner',
  STRATEGIC_PARTNER: 'Strategischer Partner',
};

export const RELATIONSHIP_STATUS: Record<string, StatusLabel> = {
  ACTIVE: { label: 'Aktiv', tone: 'success' },
  PAUSED: { label: 'Pausiert', tone: 'warning' },
  ENDED: { label: 'Beendet', tone: 'neutral' },
};

export function statusLabel(map: Record<string, StatusLabel>, status: string): StatusLabel {
  return map[status] ?? { label: status, tone: 'neutral' };
}
