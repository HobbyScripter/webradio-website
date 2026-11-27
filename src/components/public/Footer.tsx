import { Suspense } from 'react';
import { connection } from 'next/server';
import Brand from './Brand';
import FooterNav from './FooterNav';
import { Container } from '@/components/ui/layout';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
import { LEGAL_PAGE_PATHS } from '@/lib/legal-labels';
import { CustomLinkService, type PublicCustomLink } from '@/lib/custom-links/service';
import {
  PRODUCT_CONTRIBUTING_URL,
  PRODUCT_DISCUSSIONS_URL,
  PRODUCT_DOCS_URL,
  PRODUCT_ISSUES_URL,
  PRODUCT_LICENSE_URL,
  PRODUCT_PLUGIN_SDK_URL,
  PRODUCT_RELEASES_URL,
  PRODUCT_REPOSITORY_URL,
  PRODUCT_SECURITY_URL,
  PRODUCT_THEME_SDK_URL,
} from '@/lib/site';

type FooterGroup = {
  title: string;
  links: readonly { label: string; href: string; external?: boolean; iconName?: string }[];
};

/**
 * Editorial footer links. They live in their own boundary because the footer is
 * prerendered with the page: reading the database here must not make every
 * static page dynamic.
 */
async function FooterCustomLinks({ locale, title }: { locale: Locale; title: string }) {
  await connection();

  let links;
  try {
    links = await CustomLinkService.getPublicCustomLinks('FOOTER', locale);
  } catch {
    // Editorial links are optional: a database hiccup must not remove the
    // permanent footer, least of all the legal links.
    return null;
  }

  if (links.length === 0) {
    return null;
  }

  const items = links.map((link: PublicCustomLink) => ({
    label: link.label,
    href: link.url,
    external: link.type === 'EXTERNAL',
    iconName: link.iconName ?? undefined,
  }));

  return (
    <nav aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {items.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <a
              href={link.href}
              {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="block rounded text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const { t } = createServerI18n(locale);

  // The legal pages are permanent parts of the site, so their links are always
  // rendered — independent of environment variables, roles or account state.
  const groups: FooterGroup[] = [
    {
      title: t('footer.product'),
      links: [
        { label: t('footer.home'), href: '/' },
        { label: t('footer.releasesDownloads'), href: '/releases' },
        { label: t('nav.plugins'), href: '/plugins' },
        { label: t('nav.themes'), href: '/themes' },
      ],
    },
    {
      title: t('footer.documentation'),
      links: [
        { label: t('footer.projectOverview'), href: '/docs' },
        { label: t('footer.officialDocs'), href: PRODUCT_DOCS_URL, external: true },
        { label: t('footer.pluginSdk'), href: PRODUCT_PLUGIN_SDK_URL, external: true },
        { label: t('footer.themeSdk'), href: PRODUCT_THEME_SDK_URL, external: true },
      ],
    },
    {
      title: t('footer.project'),
      links: [
        { label: t('footer.sourceCode'), href: PRODUCT_REPOSITORY_URL, external: true },
        { label: t('footer.allReleases'), href: PRODUCT_RELEASES_URL, external: true },
        { label: t('footer.issues'), href: PRODUCT_ISSUES_URL, external: true },
        { label: t('footer.discussions'), href: PRODUCT_DISCUSSIONS_URL, external: true },
        { label: t('footer.security'), href: PRODUCT_SECURITY_URL, external: true },
        { label: t('footer.license'), href: PRODUCT_LICENSE_URL, external: true },
      ],
    },
    {
      title: t('footer.partnersBusiness'),
      links: [
        { label: t('footer.ourPartners'), href: '/partners' },
        { label: t('footer.advertising'), href: '/advertising' },
      ],
    },
    {
      title: t('footer.legal'),
      links: [
        { label: t('footer.impressum'), href: LEGAL_PAGE_PATHS.IMPRESSUM },
        { label: t('footer.privacy'), href: LEGAL_PAGE_PATHS.DATENSCHUTZ },
        { label: t('footer.terms'), href: LEGAL_PAGE_PATHS.NUTZUNGSBEDINGUNGEN },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/[0.07] bg-[#050507]">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
              {t('footer.description')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={PRODUCT_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                {t('footer.downloads')}
              </a>
              <a
                href={PRODUCT_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                {t('footer.documentation')}
              </a>
              <a
                href={PRODUCT_CONTRIBUTING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
              >
                {t('footer.contributing')}
              </a>
            </div>
          </div>

          <FooterNav groups={groups} />
          <Suspense fallback={null}>
            <FooterCustomLinks locale={locale} title={t('footer.more')} />
          </Suspense>
        </div>

        <div className="mt-12 space-y-4 border-t border-white/[0.07] pt-8 text-xs leading-relaxed text-zinc-500">
          <p>{t('footer.releaseSource')}</p>
          <p>
            {t('footer.legalNote', {
              terms: t('footer.terms'),
              projectDocs: t('footer.projectDocs'),
            })}
          </p>
          <p className="text-zinc-600">{t('footer.copyright')}</p>
        </div>
      </Container>
    </footer>
  );
}
