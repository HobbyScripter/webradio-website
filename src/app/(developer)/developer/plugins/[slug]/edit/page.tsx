import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireDeveloperSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { pluginCreateSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import {
  PlugIcon,
  ArrowLeftIcon,
  CheckIcon,
  UserIcon,
} from '@/components/ui/icons';

export default async function EditPluginPage({
  params,
  searchParams,
}: {
  params: { slug: string };
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

  // Get plugin by slug
  const plugin = await db.orm.public.Plugin.where({
    slug: params.slug,
    developerId: profile.id,
  }).first();

  if (!plugin) {
    notFound();
  }

  // Get tags
  const tags = await db.orm.public.PluginTag.where({
    pluginId: plugin.id,
  }).all();

  async function updatePlugin(formData: FormData) {
    'use server';

    const user = await requireDeveloperSession();

    const profile = await db.orm.public.DeveloperProfile.where({
      userId: user.id,
    }).first();

    if (!profile) {
      redirect('/developer/profile/create');
    }

    const plugin = await db.orm.public.Plugin.where({
      slug: params.slug,
      developerId: profile.id,
    }).first();

    if (!plugin) {
      notFound();
    }

    const rawData = {
      slug: formData.get('slug'),
      name: formData.get('name'),
      description: formData.get('description'),
      product: formData.get('product'),
    };

    const parsed = pluginCreateSchema.safeParse(rawData);
    if (!parsed.success) {
      redirect(
        `/developer/plugins/${params.slug}/edit?error=${encodeURIComponent(
          parsed.error.issues.map((i) => i.message).join(', '),
        )}`,
      );
    }

    // Check if slug is being changed
    if (parsed.data.slug !== plugin.slug) {
      // Check if new slug is already taken
      const existingPlugin = await db.orm.public.Plugin.first({ slug: parsed.data.slug });
      if (existingPlugin && existingPlugin.id !== plugin.id) {
        redirect(
          `/developer/plugins/${params.slug}/edit?error=${encodeURIComponent(
            'Plugin-Slug ist bereits vergeben',
          )}`,
        );
      }
    }

    // Update plugin
    await db.orm.public.Plugin.where({ id: plugin.id }).update({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      product: parsed.data.product,
    });

    // Create audit log
    try {
      const changes: Record<string, unknown> = {};
      if (parsed.data.slug !== plugin.slug) {
        changes.slug = { from: plugin.slug, to: parsed.data.slug };
      }
      if (parsed.data.name !== plugin.name) {
        changes.name = { from: plugin.name, to: parsed.data.name };
      }
      if (parsed.data.description !== plugin.description) {
        changes.description = { from: plugin.description, to: parsed.data.description };
      }

      if (Object.keys(changes).length > 0) {
        await db.orm.public.AuditLog.create({
          userId: user.id,
          action: 'PLUGIN_UPDATED',
          details: JSON.stringify({ pluginId: plugin.id, changes }),
          ipAddress: null,
          userAgent: null,
        });
      }
    } catch {
      // Non-critical
    }

    redirect(`/developer/plugins/${parsed.data.slug}`);
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
          href={`/developer/plugins/${plugin.slug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Zurück
        </Link>
      </div>

      <div className="max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <PlugIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Plugin bearbeiten
            </h1>
            <p className="text-zinc-400 mt-1">
              Bearbeite dein Plugin
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

        <form action={updatePlugin} className="mt-8 space-y-6">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Plugin-Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Mein Plugin"
                  required
                  maxLength={100}
                  autoFocus
                  defaultValue={plugin.name}
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
                Plugin-Slug <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="slug"
                  name="slug"
                  placeholder="mein-plugin"
                  required
                  maxLength={64}
                  pattern="^[a-z0-9-]+$"
                  title="Nur Kleinbuchstaben, Zahlen und Bindestriche"
                  defaultValue={plugin.slug}
                  className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors font-mono"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Nur Kleinbuchstaben, Zahlen und Bindestriche (z.B. mein-cooles-plugin)
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
                placeholder="Beschreibe dein Plugin..."
                required
                minLength={10}
                maxLength={2000}
                rows={8}
                defaultValue={plugin.description}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors resize-none"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Mindestens 10 Zeichen, maximal 2000 Zeichen
              </p>
            </div>

            {/* Product (hidden, always WEBRADIO) */}
            <input type="hidden" name="product" value="WEBRADIO" />

            {/* Current Tags */}
            {tags.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Aktuelle Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      {tag.tag}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Tags können über die API oder das Dashboard verwaltet werden
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link
              href={`/developer/plugins/${plugin.slug}`}
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
              Änderungen speichern
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
