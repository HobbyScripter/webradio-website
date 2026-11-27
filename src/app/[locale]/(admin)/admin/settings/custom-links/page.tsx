'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconSelector } from '@/components/admin/IconSelector';
import { LOCALES, type Locale } from '@/i18n/config';
import { useI18n } from '@/i18n/provider';

type Position = 'MAIN_NAVIGATION' | 'FOOTER';
type LinkType = 'INTERNAL' | 'EXTERNAL';

type AdminCustomLink = {
  id: string;
  position: Position;
  sortOrder: number;
  isActive: boolean;
  url: string;
  type: LinkType;
  openInNewTab: boolean;
  iconName: string | null;
  labels: Record<string, string>;
};

type FormState = {
  position: Position;
  sortOrder: number;
  isActive: boolean;
  url: string;
  type: LinkType;
  openInNewTab: boolean;
  iconName: string | null;
  labels: Record<string, string>;
};

const EMPTY_FORM: FormState = {
  position: 'MAIN_NAVIGATION',
  sortOrder: 0,
  isActive: true,
  url: '',
  type: 'INTERNAL',
  openInNewTab: false,
  iconName: null,
  labels: {},
};

/** Known error codes from the API; anything else falls back to a generic text. */
const ERROR_CODES = [
  'INVALID_DATA',
  'LIMIT_REACHED',
  'NOT_FOUND',
  'INVALID_INTERNAL_URL',
  'INVALID_EXTERNAL_URL',
  'INVALID_ICON',
] as const;

export default function CustomLinksAdminPage() {
  const { t } = useI18n();
  const [links, setLinks] = useState<AdminCustomLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/custom-links', { cache: 'no-store' });
      if (!res.ok) {
        setErrorCode('generic');
        return;
      }
      const data: { links?: AdminCustomLink[] } = await res.json();
      setLinks(data.links ?? []);
    } catch {
      setErrorCode('generic');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Loaded after the first paint: the effect never calls setState
    // synchronously, so it cannot cascade renders.
    void (async () => {
      await Promise.resolve();
      if (active) await fetchLinks();
    })();
    return () => {
      active = false;
    };
  }, [fetchLinks]);

  const errorText = (code: string | null): string => {
    if (!code) return '';
    if (code === 'generic') return t('admin.customLinks.error.generic');
    if ((ERROR_CODES as readonly string[]).includes(code)) {
      return t(`admin.customLinks.error.${code}`);
    }
    return t('admin.customLinks.error.generic');
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorCode(null);

    const payload = {
      ...formData,
      iconName: formData.iconName || undefined,
      labels: Object.fromEntries(
        Object.entries(formData.labels).filter(([, label]) => label.trim().length > 0),
      ),
    };

    const res = await fetch('/api/admin/custom-links', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
    });

    if (!res.ok) {
      const data: { error?: string } = await res.json().catch(() => ({}));
      setErrorCode(data.error ?? 'generic');
      return;
    }

    resetForm();
    await fetchLinks();
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('admin.customLinks.deleteConfirm'))) return;
    setErrorCode(null);
    const res = await fetch(`/api/admin/custom-links?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      setErrorCode('generic');
      return;
    }
    if (editingId === id) resetForm();
    await fetchLinks();
  };

  const startEdit = (link: AdminCustomLink) => {
    setEditingId(link.id);
    setErrorCode(null);
    setFormData({
      position: link.position,
      sortOrder: link.sortOrder,
      isActive: link.isActive,
      url: link.url,
      type: link.type,
      openInNewTab: link.openInNewTab,
      iconName: link.iconName,
      labels: { ...link.labels },
    });
  };

  const toggleActive = async (link: AdminCustomLink) => {
    setErrorCode(null);
    const res = await fetch('/api/admin/custom-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: link.id, isActive: !link.isActive }),
    });
    if (!res.ok) {
      const data: { error?: string } = await res.json().catch(() => ({}));
      setErrorCode(data.error ?? 'generic');
      return;
    }
    await fetchLinks();
  };

  if (loading) return <div>{t('admin.customLinks.loading')}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.customLinks.title')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.customLinks.limitHint')}</p>

      {errorCode && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {errorText(errorCode)}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? t('admin.customLinks.edit') : t('admin.customLinks.new')}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="custom-link-position">
                {t('admin.customLinks.position')}
              </label>
              <select
                id="custom-link-position"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value as Position })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
              >
                <option value="MAIN_NAVIGATION">{t('admin.customLinks.positionMain')}</option>
                <option value="FOOTER">{t('admin.customLinks.positionFooter')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="custom-link-sort">
                {t('admin.customLinks.sortOrder')}
              </label>
              <input
                id="custom-link-sort"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: Number.parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
                min="0"
                max="100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="custom-link-url">
              {t('admin.customLinks.url')}
            </label>
            <input
              id="custom-link-url"
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="custom-link-type">
                {t('admin.customLinks.type')}
              </label>
              <select
                id="custom-link-type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as LinkType })}
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-700"
              >
                <option value="INTERNAL">{t('admin.customLinks.typeInternal')}</option>
                <option value="EXTERNAL">{t('admin.customLinks.typeExternal')}</option>
              </select>
            </div>
            <div>
              <span className="block text-sm font-medium mb-1">{t('admin.customLinks.iconLabel')}</span>
              <IconSelector
                value={formData.iconName}
                onChange={(icon) => setFormData({ ...formData, iconName: icon })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor="custom-link-active" className="flex items-center gap-2 text-sm">
              <input
                id="custom-link-active"
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4"
              />
              {t('admin.customLinks.active')}
            </label>
            <label htmlFor="custom-link-new-tab" className="flex items-center gap-2 text-sm">
              <input
                id="custom-link-new-tab"
                type="checkbox"
                checked={formData.openInNewTab}
                onChange={(e) => setFormData({ ...formData, openInNewTab: e.target.checked })}
                className="w-4 h-4"
              />
              {t('admin.customLinks.openInNewTab')}
            </label>
          </div>

          <div>
            <span className="block text-sm font-medium mb-2">{t('admin.customLinks.labels')}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LOCALES.map((locale: Locale) => (
                <div key={locale}>
                  <label className="text-xs text-gray-500" htmlFor={`custom-link-label-${locale}`}>
                    {locale.toUpperCase()}
                  </label>
                  <input
                    id={`custom-link-label-${locale}`}
                    type="text"
                    maxLength={50}
                    value={formData.labels[locale] ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        labels: { ...formData.labels, [locale]: e.target.value },
                      })
                    }
                    className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-700 text-sm"
                    placeholder={t('admin.customLinks.labelPlaceholder')}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              {editingId ? t('admin.customLinks.save') : t('admin.customLinks.create')}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded"
              >
                {t('admin.customLinks.cancel')}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {[
                'position',
                'url',
                'type',
                'sortOrder',
                'active',
                'actions',
              ].map((column) => (
                <th
                  key={column}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                >
                  {t(`admin.customLinks.${column === 'actions' ? 'actions' : column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {links.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {t('admin.customLinks.empty')}
                </td>
              </tr>
            )}
            {links.map((link) => (
              <tr key={link.id}>
                <td className="px-6 py-4 text-sm">
                  {link.position === 'FOOTER'
                    ? t('admin.customLinks.positionFooter')
                    : t('admin.customLinks.positionMain')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  <span className="block max-w-xs truncate" title={link.url}>
                    {link.url}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {link.labels.de ?? Object.values(link.labels)[0] ?? ''}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {link.type === 'EXTERNAL'
                    ? t('admin.customLinks.typeExternal')
                    : t('admin.customLinks.typeInternal')}
                </td>
                <td className="px-6 py-4 text-sm">{link.sortOrder}</td>
                <td className="px-6 py-4 text-sm">
                  <button
                    type="button"
                    onClick={() => void toggleActive(link)}
                    className={`px-2 py-1 rounded-full text-xs ${
                      link.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {link.isActive ? t('admin.customLinks.activeYes') : t('admin.customLinks.activeNo')}
                  </button>
                </td>
                <td className="px-6 py-4 text-sm">
                  <button
                    type="button"
                    onClick={() => startEdit(link)}
                    className="text-blue-600 hover:text-blue-800 mr-2"
                  >
                    {t('admin.customLinks.editAction')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(link.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    {t('admin.customLinks.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
