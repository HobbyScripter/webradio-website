import type { ReactNode } from 'react';

export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-white/[0.07] bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.10),transparent_55%)]">
      <Container className="py-12 sm:py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            {eyebrow ? (
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              {title}
            </h1>
            {description ? (
              <p className="mt-4 text-base leading-relaxed text-zinc-400">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </Container>
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
