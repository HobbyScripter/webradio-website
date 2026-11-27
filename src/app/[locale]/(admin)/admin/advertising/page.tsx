import Link from '@/i18n/navigation';
import DashboardPageHeader from '@/components/dashboard/DashboardPageHeader';
import {
  CalendarIcon,
  GlobeIcon,
  LayersIcon,
  PackageIcon,
  UserIcon,
} from '@/components/ui/icons';

const SECTIONS = [
  {
    href: '/admin/advertising/applications',
    title: 'Bewerbungen',
    description: 'Eingehende Werbepartner-Bewerbungen prüfen, genehmigen oder ablehnen.',
    icon: <UserIcon className="h-5 w-5" />,
  },
  {
    href: '/admin/advertising/advertisers',
    title: 'Werbepartner',
    description: 'Unternehmen anlegen und pflegen, die Werbung buchen.',
    icon: <PackageIcon className="h-5 w-5" />,
  },
  {
    href: '/admin/advertising/campaigns',
    title: 'Kampagnen',
    description: 'Kampagnen anlegen, zuordnen, steuern und ihre Leistung prüfen.',
    icon: <CalendarIcon className="h-5 w-5" />,
  },
  {
    href: '/admin/advertising/creatives',
    title: 'Werbemittel',
    description: 'Anzeigenmotive mit Maßen und Alternativtexten verwalten.',
    icon: <LayersIcon className="h-5 w-5" />,
  },
  {
    href: '/admin/advertising/placements',
    title: 'Platzierungen',
    description: 'Werbeplätze der Website und ihre Live-Kampagnen im Überblick.',
    icon: <GlobeIcon className="h-5 w-5" />,
  },
];

export default function AdvertisingPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Advertising & Sponsoring"
        description="Bewerbungen, Werbepartner, Kampagnen, Werbemittel und Platzierungen an einer Stelle."
        icon={<LayersIcon className="h-6 w-6" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition-colors hover:border-violet-500/30 hover:bg-zinc-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-300">
              {section.icon}
            </span>
            <h2 className="mt-4 text-base font-semibold text-white group-hover:text-violet-300">
              {section.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
