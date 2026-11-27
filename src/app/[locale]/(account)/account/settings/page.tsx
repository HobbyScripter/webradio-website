import type { Metadata } from 'next';
import { connection } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_META, parseLocale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
import { getServerAuthSession } from '@/lib/server-auth';
import { getAccountLocale } from '@/lib/locale-preference';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { SectionHeading } from '@/components/ui/layout';

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);
  return { title: t('account.navLanguage'), robots: { index: false, follow: false } };
}

/**
 * Account language settings.
 *
 * Choosing a language here writes the cookie *and* `User.locale`, so the choice
 * follows the account to every device. Reading the stored value needs the
 * session and a database lookup, hence the request-time boundary.
 */
async function LanguageSettings({ locale }: { locale: string }) {
  await connection();
  const parsedLocale = parseLocale(locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(parsedLocale);

  const session = await getServerAuthSession();
  const stored = session?.user?.id ? await getAccountLocale(session.user.id).catch(() => null) : null;
  const effective = stored ?? parsedLocale;

  return (
    <div className="space-y-8">
      <SectionHeading title={t('language.heading')} description={t('language.description')} />

      <div className="max-w-xl space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <LanguageSelector variant="account" className="w-full" />

        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4">
            <dt className="text-zinc-400">{t('language.label')}</dt>
            <dd className="font-medium text-white">
              {LOCALE_META[effective].flag} {LOCALE_META[effective].nativeName}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-zinc-400">{t('language.savedAccount')}</dt>
            <dd className="font-mono text-xs text-zinc-400">{stored ?? '—'}</dd>
          </div>
        </dl>

        <p className="text-xs leading-relaxed text-zinc-500">{t('language.savedCookie')}</p>
      </div>
    </div>
  );
}

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  return <LanguageSettings locale={locale} />;
}
