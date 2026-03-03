import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

import type { SettingsTab } from '../../types';

interface Tab {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
}

interface SettingsSidebarProps {
  tabs: Tab[];
  selectedTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
}

export function SettingsSidebar({ tabs, selectedTab, onSelect }: SettingsSidebarProps) {
  return (
    <nav className="h-full w-44 shrink-0 border-r border-gray-200 px-2 py-4 dark:border-gray-800">
      <div className="space-y-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={clsx(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              selectedTab === id
                ? 'bg-accent-subtle text-accent font-medium dark:bg-[rgba(59,130,246,0.12)] dark:text-accent-muted'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            )}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
