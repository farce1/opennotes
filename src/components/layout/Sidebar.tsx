import clsx from 'clsx';
import { BookOpen, Circle, Cpu, Settings, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';

import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  settingsTabPath,
} from '../settings/settingsTabs';
import { useUpdate } from '../../hooks/useUpdate';

const navItems = [
  { to: '/record', labelKey: 'nav_record', icon: Circle },
  { to: '/library', labelKey: 'nav_library', icon: BookOpen },
  { to: '/setup', labelKey: 'nav_models', icon: Cpu },
  { to: settingsTabPath(DEFAULT_SETTINGS_TAB), labelKey: 'nav_settings', icon: Settings },
] as const;

const librarySubItems = [{ to: '/library/trash', labelKey: 'nav_trash' as const, icon: Trash2 }];

export function Sidebar() {
  const { t } = useTranslation('common');
  const { updateAvailable } = useUpdate();
  const location = useLocation();
  const inLibrary = location.pathname.startsWith('/library');
  const inSettings = location.pathname.startsWith('/settings');

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div data-tauri-drag-region className="h-12 shrink-0" />

      <nav className="flex flex-col gap-1 px-3" aria-label="Primary">
        {navItems.map(({ to, labelKey, icon: Icon }) => (
          <div key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => {
                const isLibraryItem = labelKey === 'nav_library';
                const isSettingsItem = labelKey === 'nav_settings';
                const active = isSettingsItem ? inSettings : isLibraryItem ? inLibrary : isActive;

                return clsx(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-accent-subtle text-accent dark:bg-[rgba(59,130,246,0.12)] dark:text-accent-muted'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
                );
              }}
            >
              <span className="relative">
                <Icon size={18} strokeWidth={2} />
                {labelKey === 'nav_settings' && updateAvailable ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
                ) : null}
              </span>
              <span>{t(labelKey)}</span>
            </NavLink>

            {labelKey === 'nav_library' && inLibrary ? (
              <div className="ml-6 mt-1 space-y-1 border-l border-gray-200/80 pl-3 dark:border-gray-700/80">
                {librarySubItems.map(({ to: subTo, labelKey: subLabelKey, icon: SubIcon }) => (
                  <NavLink
                    key={subTo}
                    to={subTo}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-accent/10 text-accent dark:bg-accent/15 dark:text-accent-muted'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
                      )
                    }
                  >
                    <SubIcon size={12} />
                    <span>{t(subLabelKey)}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}

            {labelKey === 'nav_settings' && inSettings ? (
              <div className="ml-6 mt-1 space-y-1 border-l border-gray-200/80 pl-3 dark:border-gray-700/80">
                {SETTINGS_TABS.map(({ id, labelKey: tabLabelKey, icon: TabIcon }) => (
                  <NavLink
                    key={id}
                    to={settingsTabPath(id)}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-accent/10 text-accent dark:bg-accent/15 dark:text-accent-muted'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200',
                      )
                    }
                  >
                    <TabIcon size={12} />
                    <span>{t(tabLabelKey)}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}
