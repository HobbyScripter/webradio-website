/**
 * @jest-environment node
 *
 * REAL PostgreSQL integration tests for editorial custom links.
 *
 * Run with `npm run test:integration`, which points DATABASE_URL at a
 * disposable database whose name ends in `_test`. Nothing is mocked except the
 * Next.js cache helpers, which only exist inside a render/route scope.
 */
import 'temporal-polyfill/global';

jest.mock('next/cache', () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  revalidateTag: () => undefined,
}));

import * as lucideIcons from 'lucide-react';
import { db } from '../db';
import {
  CustomLinkError,
  CustomLinkService,
  getPublicCustomLinks,
  type CustomLinkInput,
} from '../custom-links/service';

const RUN = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const VALID_ICON = Object.keys(lucideIcons).find((name) => /^[A-Z][A-Za-z]+$/.test(name)) ?? 'Radio';

function input(overrides: Partial<CustomLinkInput> = {}): CustomLinkInput {
  return {
    position: 'MAIN_NAVIGATION',
    sortOrder: 0,
    isActive: true,
    url: `/custom-${RUN}`,
    type: 'INTERNAL',
    openInNewTab: false,
    labels: { de: 'Deutsch', en: 'English' },
    ...overrides,
  };
}

async function clearLinks() {
  await db.orm.public.CustomLinkLabel.where({}).deleteAll();
  await db.orm.public.CustomLink.where({}).deleteAll();
}

async function expectCode(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CustomLinkError);
  expect(caught).toMatchObject({ code });
}

beforeEach(async () => {
  await clearLinks();
});

afterAll(async () => {
  await clearLinks();
  await db.close();
});

describe('CustomLinkService CRUD', () => {
  it('creates a link with one label per locale and returns it in the admin list', async () => {
    const created = await CustomLinkService.createCustomLink(
      input({
        url: `/crud-${RUN}`,
        labels: { de: 'CRUD Deutsch', en: 'CRUD English', pl: 'CRUD Polski' },
        iconName: VALID_ICON,
      }),
    );

    const listed = await CustomLinkService.getCustomLinks('MAIN_NAVIGATION');
    const found = listed.find((link) => link.id === created.id);

    expect(found).toBeDefined();
    expect(found?.labels).toEqual({ de: 'CRUD Deutsch', en: 'CRUD English', pl: 'CRUD Polski' });
    expect(found?.iconName).toBe(VALID_ICON);

    await CustomLinkService.deleteCustomLink(created.id);
    expect(await CustomLinkService.getCustomLinkById(created.id)).toBeNull();
  });

  it('updates fields and replaces the label set instead of merging it', async () => {
    const created = await CustomLinkService.createCustomLink(
      input({ url: `/update-${RUN}`, labels: { de: 'Alt', en: 'Old' } }),
    );

    const updated = await CustomLinkService.updateCustomLink(created.id, {
      url: `/update-neu-${RUN}`,
      sortOrder: 42,
      labels: { de: 'Neu', fr: 'Nouveau' },
    });

    expect(updated?.url).toBe(`/update-neu-${RUN}`);
    expect(updated?.sortOrder).toBe(42);

    const labels = await db.orm.public.CustomLinkLabel.where({ linkId: created.id }).all();
    expect(labels.map((label) => label.locale).sort()).toEqual(['de', 'fr']);

    await CustomLinkService.deleteCustomLink(created.id);
  });

  it('deletes the labels together with the link', async () => {
    const created = await CustomLinkService.createCustomLink(
      input({ url: `/delete-${RUN}`, labels: { de: 'Weg', en: 'Gone' } }),
    );

    await CustomLinkService.deleteCustomLink(created.id);

    expect(await db.orm.public.CustomLinkLabel.where({ linkId: created.id }).all()).toEqual([]);
  });

  it('reports a missing link instead of creating one', async () => {
    await expectCode(
      CustomLinkService.updateCustomLink(`missing_${RUN}`, { sortOrder: 1 }),
      'NOT_FOUND',
    );
  });
});

describe('activation and public output', () => {
  it('serves only active links and drops them immediately after deactivation', async () => {
    const created = await CustomLinkService.createCustomLink(
      input({ url: `/active-${RUN}`, labels: { de: 'Aktiv', en: 'Active' } }),
    );

    expect((await getPublicCustomLinks('MAIN_NAVIGATION', 'de')).map((link) => link.id)).toContain(
      created.id,
    );

    await CustomLinkService.updateCustomLink(created.id, { isActive: false });

    expect((await getPublicCustomLinks('MAIN_NAVIGATION', 'de')).map((link) => link.id)).not.toContain(
      created.id,
    );

    await CustomLinkService.deleteCustomLink(created.id);
  });

  it('keeps header and footer links apart', async () => {
    const main = await CustomLinkService.createCustomLink(
      input({ position: 'MAIN_NAVIGATION', url: `/main-${RUN}`, labels: { de: 'Haupt', en: 'Main' } }),
    );
    const footer = await CustomLinkService.createCustomLink(
      input({ position: 'FOOTER', url: `/footer-${RUN}`, labels: { de: 'Fuss', en: 'Foot' } }),
    );

    const mainLinks = await getPublicCustomLinks('MAIN_NAVIGATION', 'de');
    const footerLinks = await getPublicCustomLinks('FOOTER', 'de');

    expect(mainLinks.map((link) => link.id)).toContain(main.id);
    expect(mainLinks.map((link) => link.id)).not.toContain(footer.id);
    expect(footerLinks.map((link) => link.id)).toEqual([footer.id]);

    await CustomLinkService.deleteCustomLink(main.id);
    await CustomLinkService.deleteCustomLink(footer.id);
  });

  it('returns links in sort order', async () => {
    const third = await CustomLinkService.createCustomLink(
      input({ sortOrder: 30, url: `/sort-c-${RUN}`, labels: { de: 'C', en: 'C' } }),
    );
    const first = await CustomLinkService.createCustomLink(
      input({ sortOrder: 10, url: `/sort-a-${RUN}`, labels: { de: 'A', en: 'A' } }),
    );
    const second = await CustomLinkService.createCustomLink(
      input({ sortOrder: 20, url: `/sort-b-${RUN}`, labels: { de: 'B', en: 'B' } }),
    );

    const order = (await getPublicCustomLinks('MAIN_NAVIGATION', 'de')).map((link) => link.id);
    expect(order.indexOf(first.id)).toBeLessThan(order.indexOf(second.id));
    expect(order.indexOf(second.id)).toBeLessThan(order.indexOf(third.id));

    await CustomLinkService.deleteCustomLink(third.id);
    await CustomLinkService.deleteCustomLink(first.id);
    await CustomLinkService.deleteCustomLink(second.id);
  });

  it('serves the label of the requested language and omits links without one', async () => {
    const created = await CustomLinkService.createCustomLink(
      input({ url: `/locale-${RUN}`, labels: { de: 'Deutsch', en: 'English' } }),
    );

    const german = (await getPublicCustomLinks('MAIN_NAVIGATION', 'de')).find(
      (link) => link.id === created.id,
    );
    const english = (await getPublicCustomLinks('MAIN_NAVIGATION', 'en')).find(
      (link) => link.id === created.id,
    );
    const polish = (await getPublicCustomLinks('MAIN_NAVIGATION', 'pl')).find(
      (link) => link.id === created.id,
    );

    expect(german?.label).toBe('Deutsch');
    expect(english?.label).toBe('English');
    expect(polish).toBeUndefined();

    await CustomLinkService.deleteCustomLink(created.id);
  });
});

describe('limit per position', () => {
  it('refuses an eleventh active link and allows an inactive one', async () => {
    const created: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const link = await CustomLinkService.createCustomLink(
        input({ sortOrder: index, url: `/limit-${index}-${RUN}`, labels: { de: `Limit ${index}` } }),
      );
      created.push(link.id);
    }

    await expectCode(
      CustomLinkService.createCustomLink(
        input({ sortOrder: 11, url: `/limit-11-${RUN}`, labels: { de: 'Zu viel' } }),
      ),
      'LIMIT_REACHED',
    );

    const inactive = await CustomLinkService.createCustomLink(
      input({
        sortOrder: 12,
        url: `/limit-inactive-${RUN}`,
        labels: { de: 'Inaktiv' },
        isActive: false,
      }),
    );

    await expectCode(
      CustomLinkService.updateCustomLink(inactive.id, { isActive: true }),
      'LIMIT_REACHED',
    );

    for (const id of [...created, inactive.id]) {
      await CustomLinkService.deleteCustomLink(id);
    }
  });
});

describe('validation', () => {
  it('rejects internal URLs that are not site paths', async () => {
    await expectCode(
      CustomLinkService.createCustomLink(input({ url: 'https://example.com', type: 'INTERNAL' })),
      'INVALID_INTERNAL_URL',
    );
    await expectCode(
      CustomLinkService.createCustomLink(input({ url: '//evil.example', type: 'INTERNAL' })),
      'INVALID_INTERNAL_URL',
    );
    await expectCode(
      CustomLinkService.createCustomLink(input({ url: 'news', type: 'INTERNAL' })),
      'INVALID_INTERNAL_URL',
    );
  });

  it('rejects unsafe or non-http schemes for external links', async () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '/relative-path',
    ]) {
      await expectCode(
        CustomLinkService.createCustomLink(input({ url, type: 'EXTERNAL' })),
        'INVALID_EXTERNAL_URL',
      );
    }
  });

  it('accepts absolute http and https external links', async () => {
    const link = await CustomLinkService.createCustomLink(
      input({
        url: `https://example.com/${RUN}`,
        type: 'EXTERNAL',
        openInNewTab: true,
        labels: { de: 'Extern' },
      }),
    );
    expect(link.type).toBe('EXTERNAL');
    expect(link.openInNewTab).toBe(true);
    await CustomLinkService.deleteCustomLink(link.id);
  });

  it('validates icon names on the server', async () => {
    await expectCode(
      CustomLinkService.createCustomLink(input({ iconName: 'DefinitelyNotAnIcon' })),
      'INVALID_ICON',
    );

    const link = await CustomLinkService.createCustomLink(input({ iconName: VALID_ICON }));
    expect(link.iconName).toBe(VALID_ICON);
    await CustomLinkService.deleteCustomLink(link.id);
  });

  it('rejects empty label sets and out-of-range sort orders', async () => {
    await expectCode(CustomLinkService.createCustomLink(input({ labels: {} })), 'INVALID_DATA');
    await expectCode(CustomLinkService.createCustomLink(input({ sortOrder: 101 })), 'INVALID_DATA');
  });

  it('checks the URL against the stored type when only the URL is updated', async () => {
    const created = await CustomLinkService.createCustomLink(
      input({ url: `/type-${RUN}`, type: 'INTERNAL', labels: { de: 'Typ' } }),
    );

    await expectCode(
      CustomLinkService.updateCustomLink(created.id, { url: 'https://example.com' }),
      'INVALID_INTERNAL_URL',
    );

    await CustomLinkService.deleteCustomLink(created.id);
  });
});
