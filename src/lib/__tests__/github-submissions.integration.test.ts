/**
 * @jest-environment node
 */
import { db } from '../db';
import {
  AuthError,
  hashPassword,
  ensureTestDatabase,
} from '../auth-service';
import {
  createCatalogEntry,
  addCatalogVersion,
  submitCatalogEntry,
} from '../developer-catalog-service';

const RUN = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

let developerId = '';

beforeAll(async () => {
  ensureTestDatabase();
  await db.orm.public.Session.where({}).deleteAll();
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.Plugin.where({}).deleteAll();
  await db.orm.public.Theme.where({}).deleteAll();
  await db.orm.public.DeveloperProfile.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();

  const user = await db.orm.public.User.create({
    email: `dev_${RUN}@webradio.test`,
    passwordHash: await hashPassword('GhSub2026!'),
    role: 'DEVELOPER',
    emailVerified: Temporal.Now.instant(),
    name: 'GH Dev',
  });
  developerId = user.id;
  await db.orm.public.DeveloperProfile.create({
    userId: developerId,
    displayName: `GH Studio ${RUN}`,
  });
});

afterAll(async () => {
  await db.orm.public.AuditLog.where({}).deleteAll();
  await db.orm.public.Plugin.where({}).deleteAll();
  await db.orm.public.Theme.where({}).deleteAll();
  await db.orm.public.DeveloperProfile.where({}).deleteAll();
  await db.orm.public.User.where({}).deleteAll();
  await db.close();
});

describe('GitHub submissions', () => {
  it('accepts a valid GitHub release URL as source without auto-publishing', async () => {
    const entry = await createCatalogEntry({
      actorId: developerId,
      kind: 'PLUGIN',
      raw: {
        name: `GH Plugin ${RUN}`,
        slug: `gh-plugin-${RUN}`,
        description: 'Plugin mit GitHub-Bezugsquelle.',
        saveAsDraft: true,
      },
    });

    const version = await addCatalogVersion({
      actorId: developerId,
      kind: 'PLUGIN',
      entryId: entry.id,
      raw: {
        version: '1.0.0',
        fileUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
        fileSize: 1024,
        checksum: 'gh-checksum',
      },
    });
    expect(version.id).toBeTruthy();

    const submitted = await submitCatalogEntry({
      actorId: developerId,
      kind: 'PLUGIN',
      entryId: entry.id,
    });
    expect(submitted.status).toBe('PENDING_REVIEW');
    expect(submitted.isPublished).toBe(false);

    const row = await db.orm.public.Plugin.first({ id: entry.id });
    expect(row?.status).toBe('PENDING_REVIEW');
    expect(row?.isPublished).toBe(false);
  });

  it('rejects an invalid GitHub URL', async () => {
    const entry = await createCatalogEntry({
      actorId: developerId,
      kind: 'THEME',
      raw: {
        name: `GH Theme ${RUN}`,
        slug: `gh-theme-${RUN}`,
        description: 'Theme mit ungueltiger GitHub-URL.',
        saveAsDraft: true,
      },
    });

    await expect(
      addCatalogVersion({
        actorId: developerId,
        kind: 'THEME',
        entryId: entry.id,
        raw: {
          version: '1.0.0',
          fileUrl: 'https://github.com/owner',
          fileSize: 512,
          checksum: 'gh-theme-checksum',
        },
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('still accepts ordinary file upload URLs', async () => {
    const entry = await createCatalogEntry({
      actorId: developerId,
      kind: 'PLUGIN',
      raw: {
        name: `Upload Plugin ${RUN}`,
        slug: `upload-plugin-${RUN}`,
        description: 'Plugin mit normalem Upload-Link.',
        saveAsDraft: true,
      },
    });

    const version = await addCatalogVersion({
      actorId: developerId,
      kind: 'PLUGIN',
      entryId: entry.id,
      raw: {
        version: '1.0.0',
        fileUrl: 'https://example.com/plugin.zip',
        fileSize: 2048,
        checksum: 'upload-checksum',
      },
    });
    expect(version.id).toBeTruthy();
  });
});