import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

import type { SettingsTab } from '../../types';

interface Tab {
  id: SettingsTab;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface SettingsSidebarProps {
  tabs: Tab[];
  selectedTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
}

export function SettingsSidebar({ tabs, selectedTab, onSelect }: SettingsSidebarProps) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Settings sections">
      {tabs.map(({ id, label, description, icon: Icon }) => {
        const selected = selectedTab === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            title={description}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-150',
              selected
                ? 'border-accent/35 bg-accent/12 text-accent shadow-sm dark:border-accent/45 dark:bg-accent/18 dark:text-accent-muted'
                : 'border-gray-200/80 bg-white/75 text-gray-600 hover:border-gray-300 hover:bg-white dark:border-gray-700/80 dark:bg-gray-900/55 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800/80',
            )}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
