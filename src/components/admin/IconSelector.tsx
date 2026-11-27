'use client';

import { useState, useMemo } from 'react';
import * as lucideIcons from 'lucide-react';
import { useI18n } from '@/i18n/provider';

/** Only the icon components are selectable, not the module helpers. */
const ICONS = lucideIcons as unknown as Record<
  string,
  React.ComponentType<{ className?: string }>
>;
const ICON_NAMES = Object.keys(ICONS);

export function IconSelector({ value, onChange }: { value: string | null; onChange: (icon: string | null) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredIcons = useMemo(() => {
    if (!search) return ICON_NAMES.slice(0, 50);
    return ICON_NAMES.filter(name => name.toLowerCase().includes(search.toLowerCase())).slice(0, 50);
  }, [search]);

  // An unknown stored name (renamed or removed icon) renders as "no icon"
  // instead of crashing the admin form.
  const selectedIcon = value && Object.prototype.hasOwnProperty.call(ICONS, value) ? ICONS[value] : null;
  const SelectedIconComponent = selectedIcon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('admin.customLinks.icon.choose')}
        className="flex w-full items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        {SelectedIconComponent ? (
          <SelectedIconComponent className="w-5 h-5" />
        ) : (
          <span className="text-gray-400">{t('admin.customLinks.icon.none')}</span>
        )}
        <span className="text-sm">{value || t('admin.customLinks.icon.choose')}</span>
        <span className="ml-auto text-gray-400">▼</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder={t('admin.customLinks.icon.search')}
              aria-label={t('admin.customLinks.icon.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              autoFocus
            />
          </div>
          <div className="p-2">
            <button
              type="button"
              onClick={() => { onChange(null); setIsOpen(false); }}
              aria-label={t('admin.customLinks.icon.none')}
              className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              {t('admin.customLinks.icon.none')}
            </button>
            {filteredIcons.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-2 text-center">
                {t('admin.customLinks.icon.empty')}
              </div>
            )}
            <div className="grid grid-cols-5 gap-2 mt-2">
              {filteredIcons.map((iconName) => {
                const IconComponent = ICONS[iconName]!;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => { onChange(iconName); setIsOpen(false); }}
                    className={`p-2 rounded border ${
                      value === iconName
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    title={iconName}
                    aria-label={iconName}
                    aria-pressed={value === iconName}
                  >
                    <IconComponent className="w-6 h-6" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
