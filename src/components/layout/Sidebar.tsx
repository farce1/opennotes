import { BookOpen, Circle, Settings } from 'lucide-react';
import { NavLink } from 'react-router';
import clsx from 'clsx';
import { useUpdate } from '../../contexts/UpdateContext';

const navItems = [
  { to: '/record', label: 'Record', icon: Circle },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { updateAvailable } = useUpdate();

  return (
    <aside className="flex h-screen w-[200px] shrink-0 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div data-tauri-drag-region className="h-12 shrink-0" />

      <nav className="flex flex-col gap-1 px-3" aria-label="Primary">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-accent-subtle text-accent dark:bg-[rgba(59,130,246,0.12)] dark:text-accent-muted'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              )
            }
          >
            <span className="relative">
              <Icon size={18} strokeWidth={2} />
              {to === '/settings' && updateAvailable ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
              ) : null}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
