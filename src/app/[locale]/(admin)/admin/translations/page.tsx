import type { Metadata } from 'next';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, parseLocale, type Locale } from '@/i18n/config';
import { createServerI18n } from '@/i18n/server';
import { MESSAGES } from '@/i18n/messages';
import { compareMessages } from '@/i18n/translate';
import {
  TRANSLATABLE_FIELDS,
  translationStatusByLocale,
} from '@/lib/content-translations';
import { requireAdminSession } from '@/lib/server-auth';
import { PageHeader, SectionHeading } from '@/components/ui/layout';
import { collectTranslationTargets } from '@/lib/translation/engine';
import { listTranslationHistory, translationUsageSummary } from '@/lib/translation/history';
import { jobStats } from '@/lib/translation/jobs';
import { listProviderMeta, quotaState, readTranslationConfig, supportedTargetLocales } from '@/lib/translation/registry';
import { readProviderQuota } from '@/lib/translation/quota';
import { listSourceEntityTypes } from '@/lib/translation/source';
import {
  refreshOutdatedAction,
  retranslateAction,
  saveTranslationAction,
  setTranslationStatusAction,
  startTranslationAction,
} from './actions';

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const { t } = createServerI18n(locale);
  return { title: t('admin.translationsTitle'), robots: { index: false, follow: false } };
}

const STATUS_STYLES: Record<string, string> = {
  MISSING: 'border-zinc-600 bg-zinc-800 text-zinc-300',
  MACHINE_TRANSLATED: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  REVIEW_REQUIRED: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  APPROVED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  REJECTED: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

const ROW_LIMIT = 80;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatCost(micros: number, locale: Locale): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return formatter.format(micros / 1_000_000);
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

type PageSearchParams = Record<string, string | string[] | undefined>;

async function TranslationsContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: PageSearchParams;
}) {
  await connection();
  // Defence in depth: the layout already restricts /admin, this re-checks the
  // database role before any translation row is read.
  await requireAdminSession();

  const { t } = createServerI18n(locale);

  // Staleness is derived from the stored source hash while the matrix is built,
  // so this page never writes during a render. The explicit "mark outdated"
  // action (and the nightly worker) persist the flag and the history entry.

  const [matrix, statusByLocale, history, usage, jobs] = await Promise.all([
    collectTranslationTargets().catch(() => ({ targets: [], skippedEntityTypes: [] })),
    translationStatusByLocale().catch(
      () =>
        Object.fromEntries(
          LOCALES.map((entry) => [
            entry,
            { MISSING: 0, MACHINE_TRANSLATED: 0, REVIEW_REQUIRED: 0, APPROVED: 0, REJECTED: 0 },
          ]),
        ) as Awaited<ReturnType<typeof translationStatusByLocale>>,
    ),
    listTranslationHistory(25),
    translationUsageSummary(),
    jobStats(),
  ]);

  const config = readTranslationConfig();
  const providers = listProviderMeta();
  const activeProvider = providers.find((provider) => provider.id === config.provider) ?? providers[0];
  const supportedLocales = supportedTargetLocales();
  const entityTypes = listSourceEntityTypes();

  const targets = matrix.targets;
  const missingByLocale = LOCALES.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry] = targets.filter(
      (target) => target.locale === entry && (target.status === 'MISSING' || target.outdated),
    ).length;
    return accumulator;
  }, {});

  const visibleTargets = targets.slice(0, ROW_LIMIT);

  const interfaceCoverage = LOCALES.map((entry) => ({
    locale: entry,
    missing: compareMessages(MESSAGES[DEFAULT_LOCALE], MESSAGES[entry]).missing,
  }));

  const statusLabel = (status: string): string => {
    if (status === 'APPROVED') return t('admin.translationsApproved');
    if (status === 'REVIEW_REQUIRED') return t('admin.translationsReview');
    if (status === 'MACHINE_TRANSLATED') return t('admin.translationsMachine');
    if (status === 'REJECTED') return t('admin.translationsRejected');
    return t('admin.translationsMissingState');
  };

  // Live quota of the configured provider, cached for ten minutes. When the
  // provider cannot answer, the newest stored value is shown instead so the card
  // does not lose information it already had.
  const liveQuota = await readProviderQuota().catch(
    (): Awaited<ReturnType<typeof readProviderQuota>> => ({
      status: 'error',
      code: 'PROVIDER_ERROR',
      checkedAt: new Date().toISOString(),
    }),
  );
  const quotaUsed = liveQuota.status === 'ok' ? liveQuota.used : (usage.quota?.used ?? null);
  const quotaLimit = liveQuota.status === 'ok' ? liveQuota.limit : (usage.quota?.limit ?? null);
  const quota = quotaState(quotaUsed, quotaLimit, config.quotaWarnPercent);

  const batchQuery =
    first(searchParams.translated) !== null
      ? {
          translated: Number(first(searchParams.translated) ?? 0),
          skipped: Number(first(searchParams.skipped) ?? 0),
          blocked: Number(first(searchParams.blocked) ?? 0),
          failed: Number(first(searchParams.failed) ?? 0),
          characters: Number(first(searchParams.characters) ?? 0),
        }
      : null;

  const errorCode = first(searchParams.error);
  const outdatedMarked = first(searchParams.outdated);
  const retranslated = first(searchParams.retranslated);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow={t('admin.navHeading')}
        title={t('admin.translationsTitle')}
        description={t('admin.translationsSubtitle')}
      />

      {/* Outcome of the last action, always visible in the URL. */}
      {first(searchParams.notConfigured) === '1' ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-200">
          {t('admin.translationsNotConfigured')}
        </p>
      ) : null}
      {batchQuery !== null ? (
        <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-sm text-emerald-200">
          {t('admin.translationsBatchResult', {
            translated: batchQuery.translated,
            skipped: batchQuery.skipped,
            blocked: batchQuery.blocked,
            failed: batchQuery.failed,
            characters: batchQuery.characters,
          })}
        </p>
      ) : null}
      {errorCode !== null ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-4 text-sm text-rose-200">
          {errorCode === 'approved_protected'
            ? t('admin.translationsErrorApprovedProtected')
            : errorCode === 'not_configured'
              ? t('admin.translationsErrorNotConfigured')
              : `${t('errors.generic')} (${errorCode})`}
        </p>
      ) : null}
      {outdatedMarked !== null ? (
        <p className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-200">
          {t('admin.translationsOutdated')}: {formatNumber(Number(outdatedMarked), locale)}
        </p>
      ) : null}
      {retranslated !== null ? (
        <p className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-sm text-zinc-200">
          {t('admin.translationsRetranslate')}: {retranslated}
        </p>
      ) : null}

      <section>
        <SectionHeading title={t('admin.translationsEngine')} description={t('admin.translationsEngineDesc')} />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">{t('admin.translationsProvider')}</p>
            <p className="mt-1 text-lg font-bold text-white">{activeProvider?.label ?? config.provider}</p>
            <p className="mt-2 text-xs">
              <span
                className={`rounded-md border px-2 py-0.5 font-semibold ${
                  activeProvider?.configured ? STATUS_STYLES.APPROVED : STATUS_STYLES.REVIEW_REQUIRED
                }`}
              >
                {activeProvider?.configured
                  ? t('admin.translationsProviderReady')
                  : t('admin.translationsProviderMissing')}
              </span>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">{t('admin.translationsProviderHint')}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">{t('admin.translationsLanguages')}</p>
            <p className="mt-2 text-sm text-zinc-200">
              {supportedLocales.map((entry) => `${LOCALE_META[entry].flag} ${entry}`).join(' · ') || '—'}
            </p>
            <p className="mt-4 text-xs uppercase tracking-wider text-zinc-500">{t('admin.translationsQuota')}</p>
            <p className="mt-1 text-sm text-zinc-200">
              {liveQuota.status === 'ok'
                ? quotaLimit !== null
                  ? t('admin.translationsQuotaValue', {
                      used: formatNumber(liveQuota.used, locale),
                      limit: formatNumber(quotaLimit, locale),
                    })
                  : formatNumber(liveQuota.used, locale)
                : liveQuota.status === 'not_configured'
                  ? t('admin.translationsQuotaUnconfigured')
                  : liveQuota.status === 'unsupported'
                    ? t('admin.translationsQuotaUnknown')
                    : quotaUsed !== null && quotaLimit !== null
                      ? t('admin.translationsQuotaValue', {
                          used: formatNumber(quotaUsed, locale),
                          limit: formatNumber(quotaLimit, locale),
                        })
                      : t('admin.translationsQuotaError', { code: liveQuota.code })}
            </p>
            {liveQuota.status === 'error' && quotaUsed !== null && quotaLimit !== null ? (
              <p className="mt-2 text-xs text-zinc-500">
                {t('admin.translationsQuotaError', { code: liveQuota.code })}
              </p>
            ) : null}
            {quota === 'warning' || quota === 'exhausted' ? (
              <p className="mt-2 text-xs font-semibold text-amber-300">{quota}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">{t('admin.translationsQueue')}</p>
            <p className="mt-1 text-sm text-zinc-200">
              {t('admin.translationsQueueValue', { pending: jobs.pending, failed: jobs.failed })}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-400">
              <div>
                <dt>{t('admin.translationsCharacters')}</dt>
                <dd className="text-base font-semibold text-white">
                  {formatNumber(usage.monthCharacters, locale)}
                </dd>
              </div>
              <div>
                <dt>{t('admin.translationsRequests')}</dt>
                <dd className="text-base font-semibold text-white">{formatNumber(usage.requests, locale)}</dd>
              </div>
              <div>
                <dt>{t('admin.translationsCostToday')}</dt>
                <dd className="text-base font-semibold text-white">{formatCost(usage.todayCostMicros, locale)}</dd>
              </div>
              <div>
                <dt>{t('admin.translationsCostMonth')}</dt>
                <dd className="text-base font-semibold text-white">{formatCost(usage.monthCostMicros, locale)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-zinc-500">
              {t('admin.translationsLastCall')}: {usage.lastCallAt ?? '—'}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-amber-200">
          {t('admin.translationsPrivacy')}
        </p>
      </section>

      <section>
        <SectionHeading title={t('admin.translationsStart')} description={t('admin.translationsStartDesc')} />

        <form
          action={startTranslationAction}
          className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
        >
          <input type="hidden" name="returnLocale" value={locale} />

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
              {t('admin.translationsSelectLocales')}
            </p>
            <div className="flex flex-wrap gap-3">
              {LOCALES.filter((entry) => entry !== DEFAULT_LOCALE).map((entry) => (
                <label key={entry} className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    name="locales"
                    value={entry}
                    defaultChecked={entry === 'en'}
                    disabled={!supportedLocales.includes(entry)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                  />
                  {LOCALE_META[entry].flag} {LOCALE_META[entry].nativeName}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
              {t('admin.translationsSelectEntities')}
            </p>
            <div className="flex flex-wrap gap-3">
              {entityTypes.map((entityType) => (
                <label key={entityType} className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    name="entityTypes"
                    value={entityType}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                  />
                  <span className="font-mono">{entityType}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" name="force" className="h-4 w-4 rounded border-zinc-600 bg-zinc-900" />
            {t('admin.translationsForce')}
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              {t('admin.translationsStartButton')}
            </button>
            <span className="text-xs text-zinc-500">{t('admin.translationsMachineNote')}</span>
          </div>
        </form>

        <form action={refreshOutdatedAction} className="mt-3">
          <input type="hidden" name="returnLocale" value={locale} />
          <button
            type="submit"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white"
          >
            {t('admin.translationsRefreshOutdated')}
          </button>
        </form>
      </section>

      <section>
        <SectionHeading title={t('admin.translationsCoverage')} />

        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">{t('admin.translationsLocale')}</th>
                <th className="px-4 py-3">{t('admin.translationsApproved')}</th>
                <th className="px-4 py-3">{t('admin.translationsMachine')}</th>
                <th className="px-4 py-3">{t('admin.translationsReview')}</th>
                <th className="px-4 py-3">{t('admin.translationsRejected')}</th>
                <th className="px-4 py-3">{t('admin.translationsMissingState')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {LOCALES.filter((entry) => entry !== DEFAULT_LOCALE).map((entry) => {
                const counts = statusByLocale[entry];
                return (
                  <tr key={entry} className="bg-zinc-950/40">
                    <td className="px-4 py-3 text-zinc-200">
                      {LOCALE_META[entry].flag} {LOCALE_META[entry].nativeName}
                      <span className="ml-2 font-mono text-xs text-zinc-500">{entry}</span>
                    </td>
                    <td className="px-4 py-3 text-emerald-300">{counts.APPROVED}</td>
                    <td className="px-4 py-3 text-sky-300">{counts.MACHINE_TRANSLATED}</td>
                    <td className="px-4 py-3 text-amber-300">{counts.REVIEW_REQUIRED}</td>
                    <td className="px-4 py-3 text-rose-300">{counts.REJECTED}</td>
                    <td className="px-4 py-3 text-zinc-400">{missingByLocale[entry] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {matrix.skippedEntityTypes.length > 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            {t('admin.translationsEntity')}: {matrix.skippedEntityTypes.join(', ')}
          </p>
        ) : null}
      </section>

      <section>
        <SectionHeading
          title={t('admin.translationsInterface')}
          description={t('admin.translationsInterfaceDesc')}
        />

        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">{t('admin.translationsLocale')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {interfaceCoverage.map((entry) => (
                <tr key={entry.locale} className="bg-zinc-950/40">
                  <td className="px-4 py-3 text-zinc-200">
                    {LOCALE_META[entry.locale].flag} {LOCALE_META[entry.locale].nativeName}
                    <span className="ml-2 font-mono text-xs text-zinc-500">{entry.locale}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                        entry.missing.length === 0 ? STATUS_STYLES.APPROVED : STATUS_STYLES.REVIEW_REQUIRED
                      }`}
                    >
                      {entry.missing.length === 0
                        ? t('admin.translationsComplete')
                        : t('admin.translationsMissing', { count: entry.missing.length })}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {entry.missing.slice(0, 6).join(', ')}
                    {entry.missing.length > 6 ? ' …' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading
          title={t('admin.translationsContent')}
          description={t('admin.translationsContentDesc')}
        />

        <p className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-amber-200">
          {t('admin.translationsReviewNote')}
        </p>

        {visibleTargets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
            {t('admin.translationsNoContent')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{t('admin.translationsEntity')}</th>
                  <th className="px-4 py-3">{t('admin.translationsLocale')}</th>
                  <th className="px-4 py-3">{t('admin.translationsSource')}</th>
                  <th className="px-4 py-3">{t('admin.translationsTranslation')}</th>
                  <th className="px-4 py-3">{t('admin.translationsStatus')}</th>
                  <th className="px-4 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {visibleTargets.map((target) => (
                  <tr
                    key={`${target.entityType}:${target.entityId}:${target.field}:${target.locale}`}
                    className="bg-zinc-950/40 align-top"
                  >
                    <td className="px-4 py-3 text-zinc-200">
                      <div className="font-medium">{target.label}</div>
                      <div className="font-mono text-xs text-zinc-500">
                        {target.entityType} · {target.field}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {LOCALE_META[target.locale as Locale]?.flag ?? ''} {target.locale}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs leading-relaxed text-zinc-400">
                      <p className="line-clamp-6 whitespace-pre-line">{target.sourceText}</p>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <form action={saveTranslationAction} className="space-y-2">
                        <input type="hidden" name="returnLocale" value={locale} />
                        <input type="hidden" name="entityType" value={target.entityType} />
                        <input type="hidden" name="entityId" value={target.entityId} />
                        <input type="hidden" name="field" value={target.field} />
                        <input type="hidden" name="locale" value={target.locale} />
                        <textarea
                          name="value"
                          defaultValue={target.value}
                          rows={3}
                          placeholder={t('admin.translationsMissingState')}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                        />
                        <select
                          name="status"
                          defaultValue={target.status === 'MISSING' ? 'REVIEW_REQUIRED' : target.status}
                          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                        >
                          <option value="MACHINE_TRANSLATED">{t('admin.translationsMachine')}</option>
                          <option value="REVIEW_REQUIRED">{t('admin.translationsReview')}</option>
                          <option value="APPROVED">{t('admin.translationsApproved')}</option>
                          <option value="REJECTED">{t('admin.translationsRejected')}</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
                        >
                          {t('common.save')}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <span
                          className={`w-fit rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            STATUS_STYLES[target.status] ?? STATUS_STYLES.MISSING
                          }`}
                        >
                          {statusLabel(target.status)}
                        </span>
                        {target.outdated ? (
                          <span className="w-fit rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-semibold text-orange-300">
                            {t('admin.translationsOutdated')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <form action={setTranslationStatusAction}>
                          <input type="hidden" name="returnLocale" value={locale} />
                          <input type="hidden" name="id" value={target.translationId ?? ''} />
                          <input
                            type="hidden"
                            name="status"
                            value={target.status === 'APPROVED' ? 'REVIEW_REQUIRED' : 'APPROVED'}
                          />
                          <button
                            type="submit"
                            disabled={!target.translationId}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white disabled:opacity-40"
                          >
                            {target.status === 'APPROVED'
                              ? t('admin.translationsUnapprove')
                              : t('admin.translationsApprove')}
                          </button>
                        </form>
                        <form action={setTranslationStatusAction}>
                          <input type="hidden" name="returnLocale" value={locale} />
                          <input type="hidden" name="id" value={target.translationId ?? ''} />
                          <input type="hidden" name="status" value="REJECTED" />
                          <button
                            type="submit"
                            disabled={!target.translationId}
                            className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:border-rose-400 hover:text-rose-200 disabled:opacity-40"
                          >
                            {t('admin.translationsReject')}
                          </button>
                        </form>
                        <form action={retranslateAction}>
                          <input type="hidden" name="returnLocale" value={locale} />
                          <input type="hidden" name="entityType" value={target.entityType} />
                          <input type="hidden" name="entityId" value={target.entityId} />
                          <input type="hidden" name="field" value={target.field} />
                          <input type="hidden" name="locale" value={target.locale} />
                          <button
                            type="submit"
                            disabled={target.status === 'APPROVED'}
                            title={
                              target.status === 'APPROVED'
                                ? t('admin.translationsErrorApprovedProtected')
                                : undefined
                            }
                            className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:border-sky-400 hover:text-sky-200 disabled:opacity-40"
                          >
                            {t('admin.translationsRetranslate')}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500">
          {Object.keys(TRANSLATABLE_FIELDS).join(' · ')} — {visibleTargets.length}/{targets.length}
        </p>
      </section>

      <section>
        <SectionHeading
          title={t('admin.translationsHistory')}
          description={t('admin.translationsHistoryDesc')}
        />

        {history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
            {t('admin.translationsNoHistory')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{t('admin.translationsHistoryWhen')}</th>
                  <th className="px-4 py-3">{t('admin.translationsHistoryAction')}</th>
                  <th className="px-4 py-3">{t('admin.translationsEntity')}</th>
                  <th className="px-4 py-3">{t('admin.translationsLocale')}</th>
                  <th className="px-4 py-3">{t('admin.translationsStatus')}</th>
                  <th className="px-4 py-3">{t('admin.translationsHistoryBy')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {history.map((event) => (
                  <tr key={event.id} className="bg-zinc-950/40">
                    <td className="px-4 py-3 text-xs text-zinc-400">{event.createdAt}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-zinc-200">{event.action}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {event.entityType} · {event.field}
                      <span className="ml-1 text-zinc-600">{event.entityId.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-300">{event.locale}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {event.fromStatus ?? '—'} → {event.toStatus ?? '—'}
                      {event.note ? <span className="ml-1 text-zinc-600">({event.note})</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{event.provider ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default async function AdminTranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const locale = parseLocale((await params).locale) ?? DEFAULT_LOCALE;
  const resolvedSearchParams = await searchParams;
  const { t } = createServerI18n(locale);

  return (
    <Suspense
      fallback={<div className="py-12 text-center text-sm text-zinc-500">{t('common.loading')}</div>}
    >
      <TranslationsContent locale={locale} searchParams={resolvedSearchParams} />
    </Suspense>
  );
}
