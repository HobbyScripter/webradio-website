/**
 * @jest-environment node
 *
 * TEMPORARY Phase 5.1 browser fixtures. Runs only through
 * `npm run test:integration` against the disposable `_test` database and writes
 * the fixture ids to `.local-db/phase51-fixtures.json` for the browser run.
 *
 * This file is removed again after the Phase 5.1 browser session; it is test
 * setup, not application code.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureTestDatabase, registerUser } from '../auth-service';
import { db } from '../db';
import {
  addCatalogVersion,
  createCatalogEntry,
  decideCatalogEntry,
  submitCatalogEntry,
} from '../developer-catalog-service';
import { createNews, setNewsPublished } from '../news-service';

const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'Phase51E2E!2026';
const suffix = `e2e-${RUN}`;

type Account = {
  id: string;
  email: string;
  role: 'USER' | 'DEVELOPER' | 'ADMIN' | 'SYSTEM_ADMIN';
};

async function account(
  label: string,
  role: Account['role'],
): Promise<Account> {
  const email = `${label}_${RUN}@webradio.test`.replace(/[^a-z0-9_@.-]/gi, '');
  const user = await registerUser({
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    name: `E2E ${label}`,
  });
  await db.orm.public.User.where({ id: user.id }).update({
    role,
    emailVerified: Temporal.Now.instant(),
  });
  return { id: user.id, email, role };
}

describe('Phase 5.1 browser fixtures', () => {
  it('seeds five role accounts and realistic catalogue/news data in the test database', async () => {
    ensureTestDatabase();

    const user = await account('e2e_user', 'USER');
    const developerA = await account('e2e_deva', 'DEVELOPER');
    const developerB = await account('e2e_devb', 'DEVELOPER');
    const admin = await account('e2e_admin', 'ADMIN');
    // Controlled test fixture on the disposable database. The application
    // bootstrap/role-protection logic is not touched or bypassed at runtime.
    const systemAdmin = await account('e2e_sysadmin', 'SYSTEM_ADMIN');

    const profileA = await db.orm.public.DeveloperProfile.create({
      userId: developerA.id,
      displayName: `E2E Studio A ${RUN}`,
      bio: 'Browser-Testprofil A',
    });
    const profileB = await db.orm.public.DeveloperProfile.create({
      userId: developerB.id,
      displayName: `E2E Studio B ${RUN}`,
      bio: 'Browser-Testprofil B',
    });

    const version = (v: string) => ({
      version: v,
      fileUrl: `https://example.com/${suffix}-${v}.zip`,
      fileSize: 2048,
      checksum: `checksum-${suffix}-${v}`,
      description: 'Browser-Testversion',
    });

    // Developer A: pending plugin for the admin moderation flow.
    const pendingPlugin = await createCatalogEntry({
      actorId: developerA.id,
      kind: 'PLUGIN',
      raw: {
        name: `E2E Wartendes Plugin ${RUN}`,
        slug: `e2e-pending-plugin-${RUN}`,
        description: 'Ein Plugin, das auf eine Moderationsentscheidung wartet.',
        saveAsDraft: true,
      },
    });
    await addCatalogVersion({
      actorId: developerA.id,
      kind: 'PLUGIN',
      entryId: pendingPlugin.id,
      raw: version('1.0.0'),
    });
    await submitCatalogEntry({
      actorId: developerA.id,
      kind: 'PLUGIN',
      entryId: pendingPlugin.id,
    });

    // Developer A: draft theme for editing/submitting in the browser.
    const draftTheme = await createCatalogEntry({
      actorId: developerA.id,
      kind: 'THEME',
      raw: {
        name: `E2E Entwurf Theme ${RUN}`,
        slug: `e2e-draft-theme-${RUN}`,
        description: 'Ein Entwurf, der im Browser bearbeitet wird.',
        saveAsDraft: true,
      },
    });
    await addCatalogVersion({
      actorId: developerA.id,
      kind: 'THEME',
      entryId: draftTheme.id,
      raw: version('0.1.0'),
    });

    // Developer A: already approved and published theme for the re-review test.
    const publishedTheme = await createCatalogEntry({
      actorId: developerA.id,
      kind: 'THEME',
      raw: {
        name: `E2E Veröffentlichtes Theme ${RUN}`,
        slug: `e2e-published-theme-${RUN}`,
        description: 'Ein freigegebenes Theme für den erneuten Prüfzyklus.',
        saveAsDraft: true,
      },
    });
    await addCatalogVersion({
      actorId: developerA.id,
      kind: 'THEME',
      entryId: publishedTheme.id,
      raw: version('1.0.0'),
    });
    await submitCatalogEntry({
      actorId: developerA.id,
      kind: 'THEME',
      entryId: publishedTheme.id,
    });
    await decideCatalogEntry({
      actorId: admin.id,
      kind: 'THEME',
      entryId: publishedTheme.id,
      decision: 'APPROVED',
    });

    // Developer B: private draft, must stay invisible to Developer A.
    const privatePlugin = await createCatalogEntry({
      actorId: developerB.id,
      kind: 'PLUGIN',
      raw: {
        name: `E2E Privates Plugin B ${RUN}`,
        slug: `e2e-private-plugin-${RUN}`,
        description: 'Gehört ausschließlich Entwickler B.',
        saveAsDraft: true,
      },
    });
    await addCatalogVersion({
      actorId: developerB.id,
      kind: 'PLUGIN',
      entryId: privatePlugin.id,
      raw: version('2.0.0'),
    });

    // News: one published and one draft article.
    const publishedNews = await createNews({
      actorId: admin.id,
      raw: {
        slug: `e2e-news-published-${RUN}`,
        title: `E2E Nachricht veröffentlicht ${RUN}`,
        summary: 'Öffentlich sichtbar',
        content: 'Diese Nachricht ist für die Browser-Prüfung veröffentlicht.',
      },
    });
    await setNewsPublished({
      actorId: admin.id,
      newsId: publishedNews.id,
      published: true,
    });

    const draftNews = await createNews({
      actorId: admin.id,
      raw: {
        slug: `e2e-news-draft-${RUN}`,
        title: `E2E Nachricht Entwurf ${RUN}`,
        summary: 'Nicht öffentlich',
        content: 'Dieser Entwurf darf öffentlich nicht sichtbar sein.',
      },
    });

    const fixtures = {
      run: RUN,
      password: PASSWORD,
      accounts: { user, developerA, developerB, admin, systemAdmin },
      profiles: { a: profileA.id, b: profileB.id },
      entries: {
        pendingPluginId: pendingPlugin.id,
        pendingPluginSlug: pendingPlugin.slug,
        draftThemeId: draftTheme.id,
        draftThemeSlug: draftTheme.slug,
        publishedThemeId: publishedTheme.id,
        publishedThemeSlug: publishedTheme.slug,
        privatePluginId: privatePlugin.id,
        privatePluginSlug: privatePlugin.slug,
      },
      news: {
        publishedId: publishedNews.id,
        publishedSlug: publishedNews.slug,
        draftId: draftNews.id,
        draftSlug: draftNews.slug,
      },
      createdAt: new Date().toISOString(),
    };

    writeFileSync(
      path.join(process.cwd(), '.local-db', 'phase51-fixtures.json'),
      `${JSON.stringify(fixtures, null, 2)}\n`,
      'utf8',
    );

    expect(user.role).toBe('USER');
    expect(systemAdmin.role).toBe('SYSTEM_ADMIN');
    await db.close();
  });
});
