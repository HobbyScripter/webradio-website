import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { themeCreateSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import {
  PaletteIcon,
  ArrowLeftIcon,
  CheckIcon,
  PlugIcon,
} from '@/components/ui/icons';

export default async function CreateThemePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireDeveloperSession();

  // Get developer profile
  const profile = await db.orm.public.DeveloperProfile.where({
    userId: user.id,
  }).first();

  if (!profile) {
    redirect('/developer/profile/create');
  }

  async function createTheme(formData: FormData) {
    'use server';

    const user = await requireDeveloperSession();

    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      redirect('/developer/profile/create');
    }

    const rawData = {
      slug: formData.get('slug'),
      name: formData.get('name'),
      description: formData.get('description'),
      product: formData.get('product'),
    };

    const parsed = themeCreateSchema.safeParse(rawData);
    if (!parsed.success) {
      redirect(
        `/developer/themes/create?error=${encodeURIComponent(
          parsed.error.issues.map((i) => i.message).join(', '),
        )}`,
      );
    }

    // Check if slug is already taken
    const existingTheme = await db.orm.public.Theme.first({ slug: parsed.data.slug });
    if (existingTheme) {
      redirect(
        `/developer/themes/create?error=${encodeURIComponent(
          'Theme-Slug ist bereits vergeben',
        )}`,
      );
    }

    // Create the theme
    const theme = await db.orm.public.Theme.create({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      product: parsed.data.product,
      developerId: profile.id,
      status: 'PENDING_REVIEW',
      isPublished: false,
      downloads: 0,
    });

    // Create audit log
    try {
      await db.orm.public.AuditLog.create({
        userId: user.id,
        action: 'THEME_CREATED',
        details: JSON.stringify({ themeId: theme.id, slug: theme.slug }),
        ipAddress: null,
        userAgent: null,
      });
    } catch {
      // Non-critical
    }

    redirect(`/developer/themes/${theme.slug}`);
  }

  // Generate slug from name
  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/--+/g, '-')
      .substring(0, 64);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/developer/themes"
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </Link>
      </div>

      <div className="max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-palette-500/10 text-palette-400">
            <PaletteIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Neues Theme erstellen
            </h1>
            <p className="text-zinc-400 mt-1">
              Erstelle ein neues Theme für WebRadio
            </p>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : null}

        <form action={createTheme} className="mt-8 space-y-6">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Theme-Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <PlugIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Mein Cooles Theme"
                  required
                  maxLength={100}
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
                  onChange={(e) => {
                    const slugInput = document.getElementById('slug') as HTMLInputElement;
                    if (slugInput && !slugInput.value) {
                      slugInput.value = generateSlug(e.target.value);
                    }
                  }}
                />
              </div>
            </div>

            {/* Slug */}
            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Theme-Slug <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="slug"
                  name="slug"
                  placeholder="mein-cooles-theme"
                  required
                  maxLength={64}
                  pattern="^[a-z0-9-]+$"
                  title="Nur Kleinbuchstaben, Zahlen und Bindestriche"
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors font-mono"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Nur Kleinbuchstaben, Zahlen und Bindestriche (z.B. mein-cooles-theme)
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Beschreibung <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                placeholder="Beschreibe dein Theme..."
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors resize-none"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Mindestens 10 Zeichen, maximal 2000 Zeichen
              </p>
            </div>

            {/* Product (hidden, always WEBRADIO) */}
            <input type="hidden" name="product" value="WEBRADIO" />
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link
              href="/developer/themes"
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Abbrechen
            </Link>
            <Button
              type="submit"
              size="md"
              className="inline-flex items-center gap-2"
            >
              <CheckIcon className="h-4 w-4" />
              Theme erstellen
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
