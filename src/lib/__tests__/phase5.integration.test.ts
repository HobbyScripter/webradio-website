/**
 * @jest-environment node
 *
 * REAL PostgreSQL integration tests for the Phase 5 developer and admin
 * backends. Nothing is mocked: ownership checks, moderation transitions, audit
 * logging and public visibility all run against the disposable `_test`
 * database (see `npm run test:integration`).
 */
import {
  ForbiddenError,
  NotFoundError,
  registerUser,
} from '../auth-service';
import { db } from '../db';
import {
  addCatalogVersion,
  createCatalogEntry,
  decideCatalogEntry,
  deleteCatalogEntry,
  getOwnedEntry,
  listOwnedEntries,
  submitCatalogEntry,
  updateCatalogEntry,
  withdrawCatalogEntry,
} from '../developer-catalog-service';
import {
  createNews,
  deleteNews,
  setNewsPublished,
  updateNews,
} from '../news-service';
import {
  getPublishedNewsBySlug,
  getPublishedPluginBySlug,
  getPublishedThemeBySlug,
  listPublishedNews,
} from '../catalog';

// Slugs only allow lowercase letters, digits and hyphens.
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'PhaseFiveIntegration2026!';
const STARTED_AT = Date.now();

const userIds: string[] = [];
let regularUserId = '';
let developerAId = '';
let developerBId = '';
let adminId = '';
let noProfileDeveloperId = '';
let profileAId = '';
let profileBId = '';

const themeSlug = `phase5-theme-${RUN}`;
const pluginSlug = `phase5-plugin-${RUN}`;
const changesThemeSlug = `phase5-changes-${RUN}`;
const newsSlug = `phase5-news-${RUN}`;

const createdEntryIds: string[] = [];
const createdNewsIds: string[] = [];

async function createUser(
  label: string,
  role: 'USER' | 'DEVELOPER' | 'ADMIN' | 'SYSTEM_ADMIN',
): Promise<string> {
  const user = await registerUser({
    email: `phase5_${label}_${RUN}@webradio.test`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    name: `Phase5 ${label}`,
  });
  userIds.push(user.id);
  if (role !== 'USER') {
    await db.orm.public.User.where({ id: user.id }).update({
      role,
      emailVerified: Temporal.Now.instant(),
    });
  }
  return user.id;
}

function track<T extends { id: string }>(entry: T): T {
  createdEntryIds.push(entry.id);
  return entry;
}

beforeAll(async () => {
  regularUserId = await createUser('user', 'USER');
  developerAId = await createUser('dev_a', 'DEVELOPER');
  developerBId = await createUser('dev_b', 'DEVELOPER');
  adminId = await createUser('admin', 'ADMIN');
  noProfileDeveloperId = await createUser('dev_noprofile', 'DEVELOPER');

  const profileA = await db.orm.public.DeveloperProfile.create({
    userId: developerAId,
    displayName: `Studio A ${RUN}`,
    githubUrl: 'https://github.com/studio-a',
  });
  profileAId = profileA.id;

  const profileB = await db.orm.public.DeveloperProfile.create({
    userId: developerBId,
    displayName: `Studio B ${RUN}`,
  });
  profileBId = profileB.id;
});

afterAll(async () => {
  // PublicationReview has no foreign key to the target row, so remove the
  // reviews for the fixtures we created before deleting the entries.
  for (const targetId of createdEntryIds) {
    await db.orm.public.PublicationReview.where({ targetId }).deleteAll();
  }
  for (const newsId of createdNewsIds) {
    await db.orm.public.News.where({ id: newsId }).delete();
  }
  for (const id of userIds) {
    await db.orm.public.AuditLog.where({ userId: id }).deleteAll();
    await db.orm.public.Session.where({ userId: id }).deleteAll();
    await db.orm.public.RateLimitBucket.where({}).deleteAll();
    await db.orm.public.User.where({ id }).delete();
  }
  await db.close();
});

describe('authorization boundaries', () => {
  it('refuses every developer service to a regular USER', async () => {
    await expect(
      createCatalogEntry({
        actorId: regularUserId,
        kind: 'PLUGIN',
        raw: { name: 'Nope', slug: `nope-${RUN}`, description: 'Kein Zugriff erlaubt.' },
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(listOwnedEntries(regularUserId, 'PLUGIN')).rejects.toThrow(ForbiddenError);
    await expect(
      getOwnedEntry(regularUserId, 'PLUGIN', createdEntryIds[0] ?? 'missing'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('requires a developer profile for catalogue writes', async () => {
    await expect(
      createCatalogEntry({
        actorId: noProfileDeveloperId,
        kind: 'THEME',
        raw: { name: 'Profil fehlt', slug: `profile-${RUN}`, description: 'Ohne Profil.' },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('keeps moderation restricted to ADMIN and above', async () => {
    const plugin = track(
      await createCatalogEntry({
        actorId: developerAId,
        kind: 'PLUGIN',
        raw: {
          name: `Boundary Plugin ${RUN}`,
          slug: `boundary-${RUN}`,
          description: 'Plugin für Berechtigungstests.',
          saveAsDraft: true,
        },
      }),
    );
    await db.orm.public.Plugin.where({ id: plugin.id }).update({ status: 'PENDING_REVIEW' });

    await expect(
      decideCatalogEntry({
        actorId: regularUserId,
        kind: 'PLUGIN',
        entryId: plugin.id,
        decision: 'APPROVED',
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      decideCatalogEntry({
        actorId: developerAId,
        kind: 'PLUGIN',
        entryId: plugin.id,
        decision: 'APPROVED',
      }),
    ).rejects.toThrow(ForbiddenError);

    const row = await db.orm.public.Plugin.first({ id: plugin.id });
    expect(row?.status).toBe('PENDING_REVIEW');
    expect(row?.isPublished).toBe(false);
  });
});

describe('developer ownership', () => {
  let themeId = '';

  it('creates a draft that belongs to the acting developer only', async () => {
    const theme = track(
      await createCatalogEntry({
        actorId: developerAId,
        kind: 'THEME',
        raw: {
          name: `Phase 5 Theme ${RUN}`,
          slug: themeSlug,
          description: 'Ein Theme für die Ownership-Tests.',
          saveAsDraft: true,
        },
      }),
    );
    themeId = theme.id;

    expect(theme).toMatchObject({
      status: 'DRAFT',
      isPublished: false,
      requiresReReview: false,
    });

    const row = await db.orm.public.Theme.first({ id: theme.id });
    expect(row?.developerId).toBe(profileAId);
    expect(row?.product).toBe('WEBRADIO');

    const audit = await db.orm.public.AuditLog.where({
      userId: developerAId,
      action: 'THEME_CREATED',
    }).all();
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.details!)).toMatchObject({ themeId: theme.id });
  });

  it('rejects a duplicate slug', async () => {
    await expect(
      createCatalogEntry({
        actorId: developerBId,
        kind: 'THEME',
        raw: {
          name: 'Doppelter Slug',
          slug: themeSlug,
          description: 'Darf nicht angelegt werden.',
          saveAsDraft: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'SLUG_EXISTS' });
  });

  it('lists only the caller’s entries', async () => {
    const own = await listOwnedEntries(developerAId, 'THEME');
    const foreign = await listOwnedEntries(developerBId, 'THEME');

    expect(own.map((entry) => entry.entry.id)).toContain(themeId);
    expect(foreign).toHaveLength(0);
  });

  it('hides foreign reads and writes behind the same 404', async () => {
    await expect(getOwnedEntry(developerBId, 'THEME', themeId)).rejects.toThrow(NotFoundError);
    await expect(
      updateCatalogEntry({
        actorId: developerBId,
        kind: 'THEME',
        entryId: themeId,
        raw: { name: 'Übernommen', slug: themeSlug, description: 'Fremdzugriff.' },
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      addCatalogVersion({
        actorId: developerBId,
        kind: 'THEME',
        entryId: themeId,
        raw: {
          version: '9.9.9',
          fileUrl: 'https://example.com/evil.zip',
          fileSize: 1,
          checksum: 'x',
        },
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      submitCatalogEntry({ actorId: developerBId, kind: 'THEME', entryId: themeId }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      deleteCatalogEntry({ actorId: developerBId, kind: 'THEME', entryId: themeId }),
    ).rejects.toThrow(NotFoundError);

    const stillThere = await db.orm.public.Theme.first({ id: themeId });
    expect(stillThere?.status).toBe('DRAFT');
    expect(stillThere?.name).toBe(`Phase 5 Theme ${RUN}`);
  });

  it('requires a version before submission', async () => {
    await expect(
      submitCatalogEntry({ actorId: developerAId, kind: 'THEME', entryId: themeId }),
    ).rejects.toMatchObject({ code: 'VERSION_REQUIRED' });
  });

  it('adds a version and submits it for review without publishing', async () => {
    const version = await addCatalogVersion({
      actorId: developerAId,
      kind: 'THEME',
      entryId: themeId,
      raw: {
        version: '1.0.0',
        description: 'Erste Fassung',
        fileUrl: 'https://example.com/phase5-theme.zip',
        fileSize: 2048,
        checksum: 'phase5-theme-checksum',
      },
    });
    expect(version.requiresReReview).toBe(false);

    const submitted = await submitCatalogEntry({
      actorId: developerAId,
      kind: 'THEME',
      entryId: themeId,
    });
    expect(submitted).toMatchObject({ status: 'PENDING_REVIEW', isPublished: false });

    expect(await getPublishedThemeBySlug(themeSlug)).toBeNull();
    expect(
      await db.orm.public.PublicationReview.where({ targetId: themeId }).all(),
    ).toHaveLength(0);
  });

  it('freezes a pending submission against new versions and double submissions', async () => {
    await expect(
      addCatalogVersion({
        actorId: developerAId,
        kind: 'THEME',
        entryId: themeId,
        raw: {
          version: '1.0.1',
          fileUrl: 'https://example.com/phase5-theme-2.zip',
          fileSize: 2048,
          checksum: 'phase5-theme-checksum-2',
        },
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_IN_PROGRESS' });

    await expect(
      submitCatalogEntry({ actorId: developerAId, kind: 'THEME', entryId: themeId }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });

  it('rejects a rejection without a reason', async () => {
    await expect(
      decideCatalogEntry({
        actorId: adminId,
        kind: 'THEME',
        entryId: themeId,
        decision: 'REJECTED',
      }),
    ).rejects.toMatchObject({ code: 'NOTES_REQUIRED' });

    const row = await db.orm.public.Theme.first({ id: themeId });
    expect(row?.status).toBe('PENDING_REVIEW');
  });

  it('approves, publishes and stores the decision exactly once', async () => {
    const decision = await decideCatalogEntry({
      actorId: adminId,
      kind: 'THEME',
      entryId: themeId,
      decision: 'APPROVED',
    });

    expect(decision).toEqual({ id: themeId, status: 'APPROVED', isPublished: true });

    const row = await db.orm.public.Theme.first({ id: themeId });
    expect(row?.status).toBe('APPROVED');
    expect(row?.isPublished).toBe(true);

    const published = await getPublishedThemeBySlug(themeSlug);
    expect(published?.id).toBe(themeId);
    expect(published?.versions[0]?.version).toBe('1.0.0');

    const reviews = await db.orm.public.PublicationReview.where({
      targetType: 'THEME',
      targetId: themeId,
    }).all();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.reviewerId).toBe(adminId);
    expect(reviews[0]?.status).toBe('APPROVED');

    const audit = await db.orm.public.AuditLog.where({
      action: 'PUBLICATION_APPROVED',
      userId: adminId,
    }).all();
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.details!)).toMatchObject({
      targetType: 'THEME',
      targetId: themeId,
      statusAfter: 'APPROVED',
      isPublished: true,
    });

    await expect(
      decideCatalogEntry({
        actorId: adminId,
        kind: 'THEME',
        entryId: themeId,
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'STALE_SUBMISSION' });
  });

  it('surfaces moderation feedback to the owner only', async () => {
    const detail = await getOwnedEntry(developerAId, 'THEME', themeId);
    expect(detail.reviews).toHaveLength(1);
    expect(detail.reviews[0]).toMatchObject({ status: 'APPROVED' });
    expect(detail.entry.status).toBe('APPROVED');

    await expect(getOwnedEntry(developerBId, 'THEME', themeId)).rejects.toThrow(NotFoundError);
  });

  it('withdraws an approved entry when its content changes', async () => {
    const updated = await updateCatalogEntry({
      actorId: developerAId,
      kind: 'THEME',
      entryId: themeId,
      raw: {
        name: `Phase 5 Theme ${RUN} v2`,
        slug: themeSlug,
        description: 'Überarbeitete Beschreibung nach der Freigabe.',
      },
    });

    expect(updated).toMatchObject({
      status: 'PENDING_REVIEW',
      isPublished: false,
      requiresReReview: true,
    });

    expect(await getPublishedThemeBySlug(themeSlug)).toBeNull();

    const audit = await db.orm.public.AuditLog.where({
      userId: developerAId,
      action: 'THEME_RESUBMITTED_FOR_REVIEW',
    }).all();
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.details!)).toMatchObject({
      statusBefore: 'APPROVED',
      statusAfter: 'PENDING_REVIEW',
      publishedAfter: false,
    });
  });

  it('withdraws a submission back to draft', async () => {
    const withdrawn = await withdrawCatalogEntry({
      actorId: developerAId,
      kind: 'THEME',
      entryId: themeId,
    });
    expect(withdrawn).toMatchObject({ status: 'DRAFT', isPublished: false });

    const audit = await db.orm.public.AuditLog.where({
      userId: developerAId,
      action: 'THEME_WITHDRAWN',
    }).all();
    expect(audit).toHaveLength(1);
  });

  it('rejects an entry and keeps it out of the public catalogue', async () => {
    await submitCatalogEntry({ actorId: developerAId, kind: 'THEME', entryId: themeId });

    const rejection = await decideCatalogEntry({
      actorId: adminId,
      kind: 'THEME',
      entryId: themeId,
      decision: 'REJECTED',
      notes: 'Die Beschreibung ist nicht ausreichend konkret.',
    });
    expect(rejection).toMatchObject({ status: 'REJECTED', isPublished: false });

    expect(await getPublishedThemeBySlug(themeSlug)).toBeNull();

    const detail = await getOwnedEntry(developerAId, 'THEME', themeId);
    expect(detail.reviews.map((review) => review.status)).toContain('REJECTED');
    expect(detail.reviews[0]?.notes).toBe('Die Beschreibung ist nicht ausreichend konkret.');
  });

  it('supports a change request followed by a resubmission', async () => {
    const changes = track(
      await createCatalogEntry({
        actorId: developerAId,
        kind: 'THEME',
        raw: {
          name: `Changes Theme ${RUN}`,
          slug: changesThemeSlug,
          description: 'Theme für den Änderungswunsch-Ablauf.',
          saveAsDraft: true,
        },
      }),
    );
    await addCatalogVersion({
      actorId: developerAId,
      kind: 'THEME',
      entryId: changes.id,
      raw: {
        version: '0.2.0',
        fileUrl: 'https://example.com/changes-theme.zip',
        fileSize: 512,
        checksum: 'changes-theme-checksum',
      },
    });
    await submitCatalogEntry({ actorId: developerAId, kind: 'THEME', entryId: changes.id });

    const decision = await decideCatalogEntry({
      actorId: adminId,
      kind: 'THEME',
      entryId: changes.id,
      decision: 'CHANGES_REQUESTED',
      notes: 'Bitte Screenshots und eine längere Beschreibung ergänzen.',
    });
    expect(decision).toMatchObject({ status: 'CHANGES_REQUESTED', isPublished: false });

    // The developer can edit and resubmit without a second version.
    await updateCatalogEntry({
      actorId: developerAId,
      kind: 'THEME',
      entryId: changes.id,
      raw: {
        name: `Changes Theme ${RUN} überarbeitet`,
        slug: changesThemeSlug,
        description: 'Überarbeitete Beschreibung mit mehr Details für die Freigabe.',
      },
    });
    const resubmitted = await submitCatalogEntry({
      actorId: developerAId,
      kind: 'THEME',
      entryId: changes.id,
    });
    expect(resubmitted.status).toBe('PENDING_REVIEW');

    const reviews = await getOwnedEntry(developerAId, 'THEME', changes.id);
    expect(reviews.reviews[0]?.status).toBe('CHANGES_REQUESTED');
  });

  it('supports the full plugin flow and re-review after a version bump', async () => {
    const plugin = track(
      await createCatalogEntry({
        actorId: developerAId,
        kind: 'PLUGIN',
        raw: {
          name: `Phase 5 Plugin ${RUN}`,
          slug: pluginSlug,
          description: 'Ein Plugin für den vollständigen Freigabeablauf.',
          saveAsDraft: true,
        },
      }),
    );

    await addCatalogVersion({
      actorId: developerAId,
      kind: 'PLUGIN',
      entryId: plugin.id,
      raw: {
        version: '1.0.0',
        fileUrl: 'https://example.com/phase5-plugin.zip',
        fileSize: 4096,
        checksum: 'phase5-plugin-checksum',
      },
    });
    await submitCatalogEntry({ actorId: developerAId, kind: 'PLUGIN', entryId: plugin.id });
    await decideCatalogEntry({
      actorId: adminId,
      kind: 'PLUGIN',
      entryId: plugin.id,
      decision: 'APPROVED',
    });

    expect((await getPublishedPluginBySlug(pluginSlug))?.id).toBe(plugin.id);

    // New version on a published entry requires a fresh review.
    const version = await addCatalogVersion({
      actorId: developerAId,
      kind: 'PLUGIN',
      entryId: plugin.id,
      raw: {
        version: '1.1.0',
        fileUrl: 'https://example.com/phase5-plugin-1-1.zip',
        fileSize: 4096,
        checksum: 'phase5-plugin-checksum-2',
      },
    });
    expect(version.requiresReReview).toBe(true);
    expect(await getPublishedPluginBySlug(pluginSlug)).toBeNull();

    const row = await db.orm.public.Plugin.first({ id: plugin.id });
    expect(row?.status).toBe('PENDING_REVIEW');
    expect(row?.isPublished).toBe(false);
  });

  it('deletes only an owned entry and audits the deletion', async () => {
    const owned = track(
      await createCatalogEntry({
        actorId: developerAId,
        kind: 'THEME',
        raw: {
          name: `Delete Theme ${RUN}`,
          slug: `delete-theme-${RUN}`,
          description: 'Wird im Test wieder gelöscht.',
          saveAsDraft: true,
        },
      }),
    );

    await expect(
      deleteCatalogEntry({ actorId: developerBId, kind: 'THEME', entryId: owned.id }),
    ).rejects.toThrow(NotFoundError);
    expect(await db.orm.public.Theme.first({ id: owned.id })).not.toBeNull();

    await deleteCatalogEntry({ actorId: developerAId, kind: 'THEME', entryId: owned.id });
    expect(await db.orm.public.Theme.first({ id: owned.id })).toBeNull();

    const audit = await db.orm.public.AuditLog.where({
      userId: developerAId,
      action: 'THEME_DELETED',
    }).all();
    expect(audit.some((log) => JSON.parse(log.details ?? '{}').entryId === owned.id)).toBe(true);
  });
});

describe('news management', () => {
  let newsId = '';

  it('refuses news administration to a regular USER', async () => {
    await expect(
      createNews({
        actorId: regularUserId,
        raw: {
          slug: `forbidden-${RUN}`,
          title: 'Nicht erlaubt',
          content: 'Dieser Benutzer ist kein Administrator.',
        },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('always creates a draft, even when the payload asks to publish', async () => {
    const article = await createNews({
      actorId: adminId,
      raw: {
        slug: newsSlug,
        title: `Phase 5 News ${RUN}`,
        summary: 'Zusammenfassung',
        content: 'Dies ist der Inhalt der Phase-5-Nachricht.',
        isPublished: true,
      },
    });
    newsId = article.id;
    createdNewsIds.push(article.id);

    expect(article.isPublished).toBe(false);

    const publicEntries = await listPublishedNews(100);
    expect(publicEntries.map((entry) => entry.id)).not.toContain(newsId);
    expect(await getPublishedNewsBySlug(newsSlug)).toBeNull();
  });

  it('publishes only after the explicit, audited transition', async () => {
    await expect(
      setNewsPublished({ actorId: regularUserId, newsId, published: true }),
    ).rejects.toThrow(ForbiddenError);

    const published = await setNewsPublished({ actorId: adminId, newsId, published: true });
    expect(published.isPublished).toBe(true);
    expect(published.publishedAt).not.toBeNull();

    const entries = await listPublishedNews(100);
    expect(entries.map((entry) => entry.id)).toContain(newsId);
    expect((await getPublishedNewsBySlug(newsSlug))?.id).toBe(newsId);

    const audit = await db.orm.public.AuditLog.where({
      userId: adminId,
      action: 'NEWS_PUBLISHED',
    }).all();
    expect(audit).toHaveLength(1);
  });

  it('updates content without changing the publication state', async () => {
    const updated = await updateNews({
      actorId: adminId,
      newsId,
      raw: {
        slug: newsSlug,
        title: `Phase 5 News ${RUN} aktualisiert`,
        summary: 'Neue Zusammenfassung',
        content: 'Der aktualisierte Inhalt bleibt veröffentlicht.',
      },
    });

    expect(updated.title).toContain('aktualisiert');
    expect(updated.isPublished).toBe(true);
  });

  it('withdraws a published article from every public read path', async () => {
    await setNewsPublished({ actorId: adminId, newsId, published: false });

    expect(await getPublishedNewsBySlug(newsSlug)).toBeNull();
    expect((await listPublishedNews(100)).map((entry) => entry.id)).not.toContain(newsId);
  });

  it('deletes the article and writes an audit entry', async () => {
    await deleteNews({ actorId: adminId, newsId });

    expect(await db.orm.public.News.first({ id: newsId })).toBeNull();
    const audit = await db.orm.public.AuditLog.where({
      userId: adminId,
      action: 'NEWS_DELETED',
    }).all();
    expect(audit).toHaveLength(1);
  });
});

describe('audit trail hygiene', () => {
  it('recorded administrative actions after the test started without secrets', async () => {
    const logs = await db.orm.public.AuditLog.where({ userId: adminId }).all();
    const actions = new Set(logs.map((log) => log.action));

    expect(actions).toContain('PUBLICATION_APPROVED');
    expect(actions).toContain('PUBLICATION_REJECTED');
    expect(actions).toContain('PUBLICATION_CHANGES_REQUESTED');
    expect(actions).toContain('NEWS_CREATED');
    expect(actions).toContain('NEWS_PUBLISHED');
    expect(actions).toContain('NEWS_DELETED');

    for (const log of logs) {
      const details = log.details ?? '';
      expect(details).not.toContain(PASSWORD);
      expect(details).not.toMatch(/\$2[aby]\$/);
    }

    for (const log of logs) {
      expect(log.createdAt.constructor.name).toBe('Instant');
      expect(Number(log.createdAt.epochMilliseconds)).toBeGreaterThanOrEqual(STARTED_AT - 1_000);
    }
  });

  it('keeps only developer-owned entries in each developer profile', async () => {
    const aThemes = await db.orm.public.Theme.where({ developerId: profileAId }).all();
    const bThemes = await db.orm.public.Theme.where({ developerId: profileBId }).all();

    expect(aThemes.length).toBeGreaterThan(0);
    expect(bThemes).toHaveLength(0);
  });
});
