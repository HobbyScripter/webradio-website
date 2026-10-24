import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { errorResponse, noStoreJson } from '@/lib/api-response';

/** GET /api/admin/moderation — entries actually waiting for a decision. */
export async function GET() {
  try {
    await requireAdminSession();

    const [plugins, themes, profiles] = await Promise.all([
      db.orm.public.Plugin.where({ status: 'PENDING_REVIEW' }).all(),
      db.orm.public.Theme.where({ status: 'PENDING_REVIEW' }).all(),
      db.orm.public.DeveloperProfile.all(),
    ]);

    const profileById = new Map(profiles.map((profile) => [profile.id, profile.displayName]));

    return noStoreJson({
      plugins: plugins.map((plugin) => ({
        id: plugin.id,
        slug: plugin.slug,
        name: plugin.name,
        status: plugin.status,
        developerName: profileById.get(plugin.developerId) ?? 'Unbekannt',
        updatedAt: plugin.updatedAt.toString(),
      })),
      themes: themes.map((theme) => ({
        id: theme.id,
        slug: theme.slug,
        name: theme.name,
        status: theme.status,
        developerName: profileById.get(theme.developerId) ?? 'Unbekannt',
        updatedAt: theme.updatedAt.toString(),
      })),
    });
  } catch (error) {
    return errorResponse('api:admin:moderation:GET', error);
  }
}
