import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuthSession } from '@/lib/server-auth';
import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { reviewResultSchema, reviewTargetSchema } from '@/lib/validations';
import { Button, ButtonLink } from '@/components/ui/button';
import {
  PlugIcon,
  PaletteIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  ArrowRightIcon,
  SearchIcon,
} from '@/components/ui/icons';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING_REVIEW: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  APPROVED: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  REJECTED: { bg: 'bg-rose-500/10', text: 'text-rose-400' },
  CHANGES_REQUESTED: { bg: 'bg-violet-500/10', text: 'text-violet-400' },
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'In Prüfung',
  APPROVED: 'Genehmigt',
  REJECTED: 'Abgelehnt',
  CHANGES_REQUESTED: 'Änderungen angefordert',
};

async function ModerationContent({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; search?: string }> }) {
  const user = await requireAdminSession();
  const { type = 'all', status = 'all', search = '' } = await searchParams;

  // Get pending reviews with related data
  let reviewsQuery = db.orm.public.PublicationReview.orderBy((r) => r.createdAt.desc());

  const statusFilter = reviewResultSchema.safeParse(status);
  if (statusFilter.success) {
    reviewsQuery = reviewsQuery.where((r) => r.status.eq(statusFilter.data));
  }

  const typeFilter = reviewTargetSchema.safeParse(type);
  if (typeFilter.success) {
    reviewsQuery = reviewsQuery.where((r) => r.targetType.eq(typeFilter.data));
  }

  const reviews = await reviewsQuery.all();

  // Enrich reviews with target data
  const enrichedReviews = await Promise.all(
    reviews.map(async (review) => {
      let targetData = null;
      
      if (review.targetType === 'PLUGIN') {
        const plugin = await db.orm.public.Plugin.first({ id: review.targetId });
        const developer = plugin
          ? await db.orm.public.DeveloperProfile.first({ id: plugin.developerId })
          : null;
        const user = developer
          ? await db.orm.public.User.first({ id: developer.userId })
          : null;
        
        targetData = {
          type: 'PLUGIN' as const,
          slug: plugin?.slug || 'unknown',
          name: plugin?.name || 'Unbekanntes Plugin',
          developerName: user?.name || user?.email || 'Unbekannt',
          developerEmail: user?.email || '',
          createdAt: plugin?.createdAt.toString() || '',
        };
      } else if (review.targetType === 'THEME') {
        const theme = await db.orm.public.Theme.first({ id: review.targetId });
        const developer = theme
          ? await db.orm.public.DeveloperProfile.first({ id: theme.developerId })
          : null;
        const user = developer
          ? await db.orm.public.User.first({ id: developer.userId })
          : null;
        
        targetData = {
          type: 'THEME' as const,
          slug: theme?.slug || 'unknown',
          name: theme?.name || 'Unbekanntes Theme',
          developerName: user?.name || user?.email || 'Unbekannt',
          developerEmail: user?.email || '',
          createdAt: theme?.createdAt.toString() || '',
        };
      }

      return {
        ...review,
        targetData,
        createdAt: review.createdAt.toString(),
      };
    })
  );

  // Filter by search
  const filteredReviews = enrichedReviews.filter((review) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      review.targetData?.name.toLowerCase().includes(searchLower) ||
      review.targetData?.developerName.toLowerCase().includes(searchLower) ||
      review.targetData?.developerEmail.toLowerCase().includes(searchLower) ||
      review.targetData?.slug.toLowerCase().includes(searchLower)
    );
  });

  // Get counts. PublicationReview only stores completed decisions; entries still
  // waiting for a decision live on Plugin/Theme with status PENDING_REVIEW.
  const [allReviews, plugins, themes] = await Promise.all([
    db.orm.public.PublicationReview.all(),
    db.orm.public.Plugin.all(),
    db.orm.public.Theme.all(),
  ]);

  const counts: Record<string, number> = {
    all: allReviews.length,
    PENDING_SUBMISSIONS:
      plugins.filter((p) => p.status === 'PENDING_REVIEW').length +
      themes.filter((t) => t.status === 'PENDING_REVIEW').length,
    APPROVED: allReviews.filter((r) => r.status === 'APPROVED').length,
    REJECTED: allReviews.filter((r) => r.status === 'REJECTED').length,
    CHANGES_REQUESTED: allReviews.filter((r) => r.status === 'CHANGES_REQUESTED').length,
  };

  const typeCounts: Record<string, number> = {
    all: allReviews.length,
    PLUGIN: allReviews.filter((r) => r.targetType === 'PLUGIN').length,
    THEME: allReviews.filter((r) => r.targetType === 'THEME').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ClockIcon className="h-6 w-6" />
            Moderation
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Verwalte Plugin- und Theme-Einreichungen
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-amber-400">{counts.PENDING_SUBMISSIONS}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Ausstehende Einreichungen</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-emerald-400">{counts.APPROVED}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Genehmigt</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-rose-400">{counts.REJECTED}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Abgelehnt</div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
          <div className="text-lg font-bold text-violet-400">{counts.CHANGES_REQUESTED}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Änderungen</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            placeholder="Suche nach Name oder Entwickler..."
            defaultValue={search}
            className="w-full rounded-xl border border-white/10 bg-[#07070a] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Link
            href="/admin/moderation?type=PLUGIN"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              type === 'PLUGIN'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Plugins ({typeCounts.PLUGIN})
          </Link>
          <Link
            href="/admin/moderation?type=THEME"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              type === 'THEME'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Themes ({typeCounts.THEME})
          </Link>
          <Link
            href="/admin/moderation?status=all"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === 'all'
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            Alle Status ({counts.all})
          </Link>
        </div>
      </div>

      {/* Reviews Table */}
      {filteredReviews.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-600/10 text-amber-400 flex items-center justify-center mx-auto">
            <ClockIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white mt-4">Keine Moderationen gefunden</h3>
          <p className="text-zinc-400 text-sm mt-2">
            {search || type !== 'all' || status !== 'all'
              ? 'Keine Einreichungen passen zu den aktuellen Filterkriterien.'
              : 'Es liegen noch keine Moderationsergebnisse vor.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50 border-b border-zinc-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Entwickler
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Datum
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredReviews.map((review) => {
                const statusColor =
                  STATUS_COLORS[review.status] ?? {
                    bg: 'bg-zinc-800',
                    text: 'text-zinc-400',
                  };
                const statusLabel = STATUS_LABELS[review.status] || review.status;
                const Icon = review.targetType === 'PLUGIN' ? PlugIcon : PaletteIcon;

                return (
                  <tr key={review.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800">
                        <Icon className="h-4 w-4 text-violet-400" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/moderation/${review.id}`}
                        className="group"
                      >
                        <div className="font-semibold text-white group-hover:text-violet-400">
                          {review.targetData?.name || 'Unbekannt'}
                        </div>
                        <div className="text-xs text-zinc-500">{review.targetData?.slug || review.targetId}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-300">{review.targetData?.developerName || 'Unbekannt'}</div>
                      <div className="text-xs text-zinc-500">{review.targetData?.developerEmail || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-medium ${statusColor.bg} ${statusColor.text}`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-500">
                        {new Date(review.createdAt).toLocaleDateString('de-DE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/moderation/${review.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 transition-colors"
                      >
                        Prüfen
                        <ArrowRightIcon className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; search?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-zinc-500 text-sm">
          Moderationen werden geladen...
        </div>
      }
    >
      <ModerationContent searchParams={searchParams} />
    </Suspense>
  );
}
