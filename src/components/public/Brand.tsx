import Link from 'next/link';
import { RadioIcon } from '@/components/ui/icons';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="WebRadio – zur Startseite"
      className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg shadow-violet-950/40 transition-transform duration-200 group-hover:scale-[1.04]">
        <RadioIcon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-bold tracking-tight text-white">WebRadio</span>
        {compact ? null : (
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Open Source Radio
          </span>
        )}
      </span>
    </Link>
  );
}
