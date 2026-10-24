import Image from 'next/image';
import Link from 'next/link';
import { SITE_TAGLINE } from '@/lib/site';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="WebRadio – zur Startseite"
      className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white shadow-lg shadow-black/40 transition-transform duration-200 group-hover:scale-[1.04]">
        <Image
          src="/brand/webradio-logo.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 object-contain"
          priority
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-bold tracking-tight text-white">WebRadio</span>
        {compact ? null : (
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {SITE_TAGLINE}
          </span>
        )}
      </span>
    </Link>
  );
}
