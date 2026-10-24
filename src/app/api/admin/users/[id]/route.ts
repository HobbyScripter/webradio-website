import { requireAdminSession } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { errorResponse, noStoreJson } from '@/lib/api-response';
import { NotFoundError } from '@/lib/auth-service';

/** GET /api/admin/users/[id] — account summary without hashes or tokens. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const user = await db.orm.public.User.first({ id });
    if (!user) {
      throw new NotFoundError('Benutzerkonto nicht gefunden.');
    }

    const [profile, sessions, auditLogs] = await Promise.all([
      db.orm.public.DeveloperProfile.where({ userId: user.id }).first(),
      db.orm.public.Session.where({ userId: user.id }).all(),
      db.orm.public.AuditLog.where({ userId: user.id })
        .orderBy((log) => log.createdAt.desc())
        .limit(20)
        .all(),
    ]);

    const [plugins, themes] = profile
      ? await Promise.all([
          db.orm.public.Plugin.where({ developerId: profile.id }).all(),
          db.orm.public.Theme.where({ developerId: profile.id }).all(),
        ])
      : [[], []];

    return noStoreJson({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified !== null,
        createdAt: user.createdAt.toString(),
        updatedAt: user.updatedAt.toString(),
      },
      developerProfile: profile
        ? {
            displayName: profile.displayName,
            bio: profile.bio,
            githubUrl: profile.githubUrl,
            websiteUrl: profile.websiteUrl,
          }
        : null,
      extensions: { plugins: plugins.length, themes: themes.length },
      sessions: { active: sessions.length },
      audit: auditLogs.map((log) => ({
        action: log.action,
        createdAt: log.createdAt.toString(),
      })),
    });
  } catch (error) {
    return errorResponse('api:admin:users:[id]:GET', error);
  }
}
