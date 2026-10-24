import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-violet-600 text-white shadow-lg shadow-violet-950/40 hover:bg-violet-500 active:bg-violet-700',
  secondary:
    'border border-white/12 bg-white/[0.04] text-zinc-100 hover:border-white/20 hover:bg-white/[0.08]',
  ghost: 'text-zinc-300 hover:bg-white/[0.06] hover:text-white',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-sm sm:text-base',
};

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070a]',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children' | 'className'>;

/** Internal or external link styled as a button. */
export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonStyles(variant, size, className);
  const isExternal = /^https?:\/\//.test(href);

  if (isExternal) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
