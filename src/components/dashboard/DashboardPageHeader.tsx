import type { ReactNode } from 'react';

/**
 * Consistent page title block for dashboard pages.
 * Breadcrumbs are rendered once by the section layout above the content.
 */
export default function DashboardPageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          {icon}
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
