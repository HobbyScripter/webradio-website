/**
 * Single source for the public names of the legal pages.
 *
 * The footer, the in-page navigation, page titles and metadata all read from
 * here, so one renamed document cannot leave "Nutzungsbedingungen" in the footer
 * while a title or a description still says something else.
 */

export const TERMS_LABEL = 'Nutzungsbedingungen';

export const LEGAL_PAGE_PATHS = {
  IMPRESSUM: '/impressum',
  DATENSCHUTZ: '/datenschutz',
  NUTZUNGSBEDINGUNGEN: '/nutzungsbedingungen',
} as const;

export const LEGAL_PAGE_LABELS = {
  IMPRESSUM: 'Impressum',
  DATENSCHUTZ: 'Datenschutz',
  NUTZUNGSBEDINGUNGEN: TERMS_LABEL,
} as const;

export const LEGAL_PAGE_NAVIGATION = [
  { label: LEGAL_PAGE_LABELS.IMPRESSUM, href: LEGAL_PAGE_PATHS.IMPRESSUM },
  { label: LEGAL_PAGE_LABELS.DATENSCHUTZ, href: LEGAL_PAGE_PATHS.DATENSCHUTZ },
  { label: LEGAL_PAGE_LABELS.NUTZUNGSBEDINGUNGEN, href: LEGAL_PAGE_PATHS.NUTZUNGSBEDINGUNGEN },
] as const;
