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
    <aside className="h-screen w-14 bg-warm-50 dark:bg-warm-900 border-r border-warm-200/80 dark:border-warm-800/80 flex items-center justify-center">
      <nav className="flex flex-col items-center gap-3" aria-label="Primary">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150',
                isActive
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-warm-600 dark:text-warm-300 hover:bg-warm-100 dark:hover:bg-warm-800',
              )
            }
            aria-label={label}
            title={label}
          >
            <span className="relative">
              <Icon size={21} strokeWidth={2.2} />
              {to === '/settings' && updateAvailable ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
              ) : null}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
