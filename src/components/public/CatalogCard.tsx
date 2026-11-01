import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ArrowRightIcon, DownloadIcon, PaletteIcon, PlugIcon } from '@/components/ui/icons';
import { isPreviewVersion } from '@/lib/catalog-display';
import { formatDate, formatNumber } from '@/lib/format';
import { markdownToPlainText } from '@/components/public/MarkdownText';

type CardItem = {
  slug: string;
  name: string;
  description: string;
  developerName: string;
  tags: string[];
  downloads: number;
  latestVersion: string | null;
  updatedAt: string;
};

export default function CatalogCard({
  item,
  kind,
  basePath,
}: {
  item: CardItem;
  kind: 'plugin' | 'theme';
  basePath: string;
}) {
  const Icon = kind === 'plugin' ? PlugIcon : PaletteIcon;
  const kindLabel = kind === 'plugin' ? 'Plugin' : 'Theme';
  const updated = formatDate(item.updatedAt);
  // Descriptions may contain Markdown; the card shows plain text only.
  const summary = markdownToPlainText(item.description);

  return (
    <Link
      href={`${basePath}/${item.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition-colors hover:border-violet-400/25 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone="neutral">{kindLabel}</Badge>
          <Badge tone="accent">Community</Badge>
        </div>
      </div>

      <h3 className="mt-4 text-base font-semibold text-white group-hover:text-violet-100">
        {item.name}
      </h3>
      <p className="mt-0.5 text-xs text-zinc-500">von {item.developerName}</p>
      <p className="mt-2.5 line-clamp-2 flex-1 text-sm leading-relaxed text-zinc-400">{summary}</p>

      {item.latestVersion ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          v{item.latestVersion}
          {isPreviewVersion(item.latestVersion) ? ' · Vorschauversion vor 1.0' : ''}
        </p>
      ) : null}

      {item.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-3">
          {item.downloads > 0 ? (
            <span className="inline-flex items-center gap-1">
              <DownloadIcon className="h-3 w-3" />
              {formatNumber(item.downloads)}
            </span>
          ) : null}
          {updated ? <span>Zuletzt aktualisiert {updated}</span> : null}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-zinc-400 transition-colors group-hover:text-violet-300">
          Details <ArrowRightIcon className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Card shown next to the catalogue entries: the way for a developer to submit
 * their own plugin or theme.
 */
export function CatalogSubmitCard({
  kind,
  sdkHref,
}: {
  kind: 'plugin' | 'theme';
  sdkHref: string;
}) {
  const Icon = kind === 'plugin' ? PlugIcon : PaletteIcon;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-dashed border-violet-400/25 bg-violet-500/[0.04] p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">
        Dein {kind === 'plugin' ? 'Plugin' : 'Theme'} hier?
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
        Erweiterungen werden von der Community beigesteuert. Wie du ein eigenes {kind === 'plugin' ? 'Plugin' : 'Theme'}{' '}
        baust und einreichst, steht im SDK.
      </p>
      <a
        href={sdkHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        Zum SDK <ArrowRightIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
