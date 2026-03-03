import { invoke } from '@tauri-apps/api/core';
import { Laptop, Moon, RotateCcw, SlidersHorizontal, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { useTheme } from '../../hooks/useTheme';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import { formatShortcutDisplay } from '../../lib/platform';
import { getSettingsStore } from '../../lib/settings';
import type { AppTheme } from '../../types';

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift']);

const themeOptions: Array<{ value: AppTheme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

function buildShortcutFromEvent(event: KeyboardEvent<HTMLButtonElement>): string | null {
  const parts: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }

  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  if (!parts.length) {
    return null;
  }

  const rawKey = event.key === ' ' ? 'Space' : event.key;
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  parts.push(key);

  return parts.join('+');
}

export function GeneralSection() {
  const { theme, setTheme } = useTheme();
  const [recordingShortcut, updateShortcut] = useSetting('recordingShortcut');
  const [capturing, setCapturing] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const shortcutFieldRef = useRef<HTMLButtonElement | null>(null);

  const shortcutValue = recordingShortcut ?? DEFAULT_SETTINGS.recordingShortcut;

  const displayShortcut = useMemo(() => formatShortcutDisplay(shortcutValue), [shortcutValue]);

  const cancelCapture = useCallback(() => {
    setCapturing(false);
  }, []);

  const startCapture = useCallback(() => {
    setShortcutError(null);
    setCapturing(true);
  }, []);

  const handleShortcutKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!capturing) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        cancelCapture();
        return;
      }

      const nextShortcut = buildShortcutFromEvent(event);
      if (!nextShortcut) {
        return;
      }

      setCapturing(false);
      setShortcutError(null);

      try {
        await invoke('update_recording_shortcut', {
          oldShortcut: shortcutValue,
          newShortcut: nextShortcut,
        });
        await updateShortcut(nextShortcut);
      } catch {
        setShortcutError('Unable to update shortcut. Previous shortcut restored.');
        try {
          await invoke('update_recording_shortcut', {
            oldShortcut: nextShortcut,
            newShortcut: shortcutValue,
          });
        } catch {
          setShortcutError('Unable to update or restore shortcut. Restart the app.');
        }
      }
    },
    [cancelCapture, capturing, shortcutValue, updateShortcut],
  );

  const handleShortcutBlur = useCallback(() => {
    if (!capturing) {
      return;
    }
    void cancelCapture();
  }, [cancelCapture, capturing]);

  const handleResetAll = useCallback(async () => {
    const confirmed = window.confirm('Reset all settings to defaults? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setResetting(true);

    try {
      const store = await getSettingsStore();
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await store.set(key, value);
      }
      window.location.reload();
    } finally {
      setResetting(false);
    }
  }, []);

  useEffect(() => {
    if (!capturing) {
      return;
    }

    shortcutFieldRef.current?.focus();
  }, [capturing]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-100">
        <SlidersHorizontal size={20} />
        <h2 className="text-lg font-semibold">General</h2>
      </div>

      <div className="border-b border-gray-100 pb-6 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Appearance
        </h3>
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
                    ? 'border-accent bg-accent-subtle text-gray-900 dark:bg-[rgba(59,130,246,0.12)] dark:text-gray-50'
                    : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-gray-100 pb-6 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Recording Shortcut
        </h3>
        <button
          ref={shortcutFieldRef}
          type="button"
          onClick={() => void startCapture()}
          onKeyDown={(event) => void handleShortcutKeyDown(event)}
          onBlur={handleShortcutBlur}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          {capturing ? 'Press shortcut...' : displayShortcut}
        </button>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Click to capture a new keyboard combination. Press Escape to cancel.
        </p>
        {shortcutError ? (
          <p className="mt-2 rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {shortcutError}
          </p>
        ) : null}
      </div>

      <div className="pb-6">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Global Reset
        </h3>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Reset every preference to defaults, including theme, shortcut, model settings, and storage options.
        </p>
        <button
          type="button"
          onClick={() => void handleResetAll()}
          disabled={resetting}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300/80 px-3 py-2 text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
        >
          <RotateCcw size={15} />
          {resetting ? 'Resetting…' : 'Reset all settings'}
        </button>
      </div>
    </section>
  );
}
