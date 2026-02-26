import { Laptop, Moon, Settings, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useSetting } from '../hooks/useSettings';
import type { AppTheme } from '../types';

const themeOptions: Array<{ value: AppTheme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [dataDirectory] = useSetting('dataDirectory');

  return (
    <section className="h-full min-h-[calc(100vh-3rem)] space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Settings size={22} />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h2 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Appearance
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const selected = theme === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => void setTheme(value)}
                className={[
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-150',
                  selected
                    ? 'border-accent bg-accent-light/60 text-warm-900 dark:text-warm-50'
                    : 'border-warm-200 bg-warm-100 text-warm-700 hover:bg-warm-200 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100 dark:hover:bg-warm-700',
                ].join(' ')}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </article>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h2 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          About
        </h2>
        <p className="mt-3 text-sm text-warm-700 dark:text-warm-100">openNotes v0.1.0</p>
      </article>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h2 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Storage
        </h2>
        <p className="mt-3 text-sm text-warm-700 dark:text-warm-100">
          {dataDirectory ?? '~/.opennotes'}
        </p>
      </article>
    </section>
  );
}
