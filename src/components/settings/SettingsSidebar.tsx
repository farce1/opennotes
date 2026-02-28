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
    <nav className="h-full w-44 shrink-0 border-r border-warm-200/80 px-2 py-4 dark:border-warm-700/60">
      <div className="space-y-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={clsx(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              selectedTab === id
                ? 'bg-accent-light/60 font-medium text-warm-900 dark:text-warm-50'
                : 'text-warm-600 hover:bg-warm-100 dark:text-warm-300 dark:hover:bg-warm-800',
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
