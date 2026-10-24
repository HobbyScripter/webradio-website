import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { formatDate, formatDateTime } from '@/lib/format';
import CatalogStatusBadge from '@/components/dashboard/CatalogStatusBadge';
import ModerationDecisionForm from '@/components/dashboard/ModerationDecisionForm';
import { moderateAction } from '@/app/(admin)/admin/actions';
import { ArrowLeftIcon, PlugIcon, PaletteIcon, AlertIcon } from '@/components/ui/icons';

export default async function ModerationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ type, id }, query] = await Promise.all([params, searchParams]);
  await requireAdminSession();

  if (type !== 'PLUGIN' && type !== 'THEME') {
    notFound();
  }

  const entry =
    type === 'PLUGIN'
      ? await db.orm.public.Plugin.first({ id })
      : await db.orm.public.Theme.first({ id });

  if (!entry) {
    notFound();
  }

  const profile = await db.orm.public.DeveloperProfile.first({ id: entry.developerId });
  const developer = profile
    ? await db.orm.public.User.first({ id: profile.userId })
    : null;

  const versions =
    type === 'PLUGIN'
      ? await db.orm.public.PluginVersion.where({ pluginId: entry.id })
          .orderBy((version) => version.releasedAt.desc())
          .all()
      : await db.orm.public.ThemeVersion.where({ themeId: entry.id })
          .orderBy((version) => version.releasedAt.desc())
          .all();

  const screenshots =
    type === 'PLUGIN'
      ? await db.orm.public.PluginScreenshot.where({ pluginId: entry.id }).all()
      : await db.orm.public.ThemeScreenshot.where({ themeId: entry.id }).all();

  const tags =
    type === 'PLUGIN'
      ? (await db.orm.public.PluginTag.where({ pluginId: entry.id }).all()).map((tag) => tag.tag)
      : (await db.orm.public.ThemeTag.where({ themeId: entry.id }).all()).map((tag) => tag.tag);

  const reviews = await db.orm.public.PublicationReview.where({
    targetType: type,
    targetId: entry.id,
  })
    .orderBy((review) => review.createdAt.desc())
    .all();

  const reviewerNames = new Map<string, string>();
  for (const review of reviews) {
    if (!reviewerNames.has(review.reviewerId)) {
      const reviewer = await db.orm.public.User.first({ id: review.reviewerId });
      reviewerNames.set(
        review.reviewerId,
        reviewer?.name ?? reviewer?.email.split('@')[0] ?? 'Unbekannt',
      );
    }
  }

  const Icon = type === 'PLUGIN' ? PlugIcon : PaletteIcon;
  const kindLabel = type === 'PLUGIN' ? 'Plugin' : 'Theme';
  const isPending = entry.status === 'PENDING_REVIEW';

  return (
    <div className="space-y-6">
      <Link
        href="/admin/moderation"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Zurück zur Moderation
      </Link>

      {query.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          {query.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-violet-500/10 p-2 text-violet-400">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{entry.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <CatalogStatusBadge status={entry.status} />
              <span className="text-xs text-zinc-500">
                {kindLabel} · {entry.slug}
              </span>
            </div>
          </div>
        </div>
        <div className="text-sm text-zinc-400">
          <div className="font-medium text-zinc-200">{profile?.displayName ?? 'Unbekannt'}</div>
          <div className="text-xs">{developer?.email ?? 'Keine Kontodaten'}</div>
        </div>
      </div>

      {!isPending ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
          <p className="flex items-center gap-2 font-semibold">
            <AlertIcon className="h-4 w-4" />
            Keine offene Entscheidung
          </p>
          <p className="mt-1 text-amber-200/80">
            Diese Einreichung ist nicht mehr in Prüfung. Eine erneute Entscheidung ist nur über
            den normalen Einreichungsprozess möglich; veraltete Formulare werden serverseitig
            abgelehnt.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-2 text-sm font-semibold text-zinc-400">Beschreibung</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">
              {entry.description}
            </p>
            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500 sm:grid-cols-3">
              <div>
                <dt className="uppercase">Erstellt</dt>
                <dd className="mt-0.5 text-zinc-300">{formatDate(entry.createdAt) ?? '—'}</dd>
              </div>
              <div>
                <dt className="uppercase">Aktualisiert</dt>
                <dd className="mt-0.5 text-zinc-300">{formatDate(entry.updatedAt) ?? '—'}</dd>
              </div>
              <div>
                <dt className="uppercase">Screenshots</dt>
                <dd className="mt-0.5 text-zinc-300">{screenshots.length}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-400">Versionen</h2>
            {versions.length === 0 ? (
              <p className="text-sm text-zinc-400">Keine Version hinterlegt.</p>
            ) : (
              <ul className="divide-y divide-zinc-800 text-sm">
                {versions.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-mono text-white">{version.version}</span>
                    <span className="text-xs text-zinc-500">
                      {formatDate(version.releasedAt) ?? '—'} ·{' '}
                      {version.fileSize.toLocaleString('de-DE')} Bytes
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-400">Bisherige Entscheidungen</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-zinc-400">Noch keine Entscheidung.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CatalogStatusBadge status={review.status} />
                      <span className="text-xs text-zinc-500">
                        {formatDateTime(review.createdAt) ?? '—'} ·{' '}
                        {reviewerNames.get(review.reviewerId) ?? 'Unbekannt'}
                      </span>
                    </div>
                    {review.notes ? (
                      <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">
                        {review.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Entscheidung</h2>
          {isPending ? (
            <ModerationDecisionForm
              action={moderateAction}
              targetType={type}
              targetId={entry.id}
            />
          ) : (
            <p className="text-sm text-zinc-400">
              Für diese Einreichung ist keine Entscheidung mehr offen.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
