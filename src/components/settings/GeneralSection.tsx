import { invoke } from '@tauri-apps/api/core';
import { Laptop, Moon, RotateCcw, SlidersHorizontal, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useSetting } from '../../hooks/useSettings';
import { useTheme } from '../../hooks/useTheme';
import i18n from '../../i18n';
import { supportedLanguages, languageLabels } from '../../i18n';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import { formatShortcutDisplay } from '../../lib/platform';
import { getSettingsStore } from '../../lib/settings';
import type { AppTheme } from '../../types';

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift']);

const panelClasses =
  'rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/45';
type ShortcutKind = 'recording' | 'pause';

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

function optionButtonClasses(selected: boolean): string {
  return [
    'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all duration-150',
    selected
      ? 'border-accent/35 bg-accent/10 text-accent shadow-sm dark:border-accent/40 dark:bg-accent/15 dark:text-accent-muted'
      : 'border-gray-200/80 bg-white/80 text-gray-600 hover:border-gray-300 hover:bg-white dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800',
  ].join(' ');
}

export function GeneralSection() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  const [appLanguage, updateAppLanguage] = useSetting('appLanguage');
  const [recordingShortcut, updateRecordingShortcut] = useSetting('recordingShortcut');
  const [pauseShortcut, updatePauseShortcut] = useSetting('pauseShortcut');
  const [capturingShortcut, setCapturingShortcut] = useState<ShortcutKind | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const recordingShortcutFieldRef = useRef<HTMLButtonElement | null>(null);
  const pauseShortcutFieldRef = useRef<HTMLButtonElement | null>(null);

  const currentLanguage = appLanguage ?? 'en';

  const themeOptions: Array<{ value: AppTheme; label: string; icon: typeof Sun }> = [
    { value: 'light', label: t('appearance_light'), icon: Sun },
    { value: 'dark', label: t('appearance_dark'), icon: Moon },
    { value: 'system', label: t('appearance_system'), icon: Laptop },
  ];

  const recordingShortcutValue = recordingShortcut ?? DEFAULT_SETTINGS.recordingShortcut;
  const pauseShortcutValue = pauseShortcut ?? DEFAULT_SETTINGS.pauseShortcut;

  const displayRecordingShortcut = useMemo(
    () => formatShortcutDisplay(recordingShortcutValue),
    [recordingShortcutValue],
  );
  const displayPauseShortcut = useMemo(
    () => formatShortcutDisplay(pauseShortcutValue),
    [pauseShortcutValue],
  );

  const cancelCapture = useCallback(() => {
    setCapturingShortcut(null);
  }, []);

  const startCapture = useCallback((target: ShortcutKind) => {
    setShortcutError(null);
    setCapturingShortcut(target);
  }, []);

  const handleShortcutKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLButtonElement>, target: ShortcutKind) => {
      if (capturingShortcut !== target) {
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

      setCapturingShortcut(null);
      setShortcutError(null);

      const currentShortcut =
        target === 'recording' ? recordingShortcutValue : pauseShortcutValue;
      const command = target === 'recording' ? 'update_recording_shortcut' : 'update_pause_shortcut';

      try {
        await invoke(command, {
          oldShortcut: currentShortcut,
          newShortcut: nextShortcut,
        });
        if (target === 'recording') {
          await updateRecordingShortcut(nextShortcut);
        } else {
          await updatePauseShortcut(nextShortcut);
        }
      } catch {
        setShortcutError(t('shortcuts_errorUpdate', { target }));
        try {
          await invoke(command, {
            oldShortcut: nextShortcut,
            newShortcut: currentShortcut,
          });
        } catch {
          setShortcutError(t('shortcuts_errorRestore', { target }));
        }
      }
    },
    [
      cancelCapture,
      capturingShortcut,
      pauseShortcutValue,
      recordingShortcutValue,
      t,
      updatePauseShortcut,
      updateRecordingShortcut,
    ],
  );

  const handleShortcutBlur = useCallback((target: ShortcutKind) => {
    if (capturingShortcut !== target) {
      return;
    }
    void cancelCapture();
  }, [cancelCapture, capturingShortcut]);

  const handleResetAll = useCallback(async () => {
    const confirmed = window.confirm(t('reset_confirm'));
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
  }, [t]);

  useEffect(() => {
    if (capturingShortcut === 'recording') {
      recordingShortcutFieldRef.current?.focus();
      return;
    }

    if (capturingShortcut === 'pause') {
      pauseShortcutFieldRef.current?.focus();
    }
  }, [capturingShortcut]);

  const handleLanguageChange = useCallback(async (lang: string) => {
    await updateAppLanguage(lang);
    await i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [updateAppLanguage]);

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <SlidersHorizontal size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">{t('general_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('general_description')}</p>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('appearance_title')}</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('appearance_description')}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const selected = theme === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => void setTheme(value)}
                className={optionButtonClasses(selected)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('language_title')}</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('language_description')}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {supportedLanguages.map((lang) => {
            const selected = currentLanguage === lang;

            return (
              <button
                key={lang}
                type="button"
                onClick={() => void handleLanguageChange(lang)}
                className={optionButtonClasses(selected)}
              >
                {languageLabels[lang]}
              </button>
            );
          })}
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('shortcuts_title')}</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('shortcuts_description')}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              {t('shortcuts_startStop')}
            </p>
            <button
              ref={recordingShortcutFieldRef}
              type="button"
              onClick={() => void startCapture('recording')}
              onKeyDown={(event) => void handleShortcutKeyDown(event, 'recording')}
              onBlur={() => handleShortcutBlur('recording')}
              className={[
                'mt-2 w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 focus:outline-none',
                capturingShortcut === 'recording'
                  ? 'border-accent/45 bg-accent/8 text-accent ring-2 ring-accent/20 dark:border-accent/50 dark:bg-accent/12 dark:text-accent-muted'
                  : 'border-gray-200/80 bg-white/80 text-gray-700 hover:border-gray-300 hover:bg-white focus:border-accent/45 focus:ring-2 focus:ring-accent/20 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {capturingShortcut === 'recording' ? t('shortcuts_pressPrompt') : displayRecordingShortcut}
            </button>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              {t('shortcuts_pauseResume')}
            </p>
            <button
              ref={pauseShortcutFieldRef}
              type="button"
              onClick={() => void startCapture('pause')}
              onKeyDown={(event) => void handleShortcutKeyDown(event, 'pause')}
              onBlur={() => handleShortcutBlur('pause')}
              className={[
                'mt-2 w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 focus:outline-none',
                capturingShortcut === 'pause'
                  ? 'border-accent/45 bg-accent/8 text-accent ring-2 ring-accent/20 dark:border-accent/50 dark:bg-accent/12 dark:text-accent-muted'
                  : 'border-gray-200/80 bg-white/80 text-gray-700 hover:border-gray-300 hover:bg-white focus:border-accent/45 focus:ring-2 focus:ring-accent/20 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {capturingShortcut === 'pause' ? t('shortcuts_pressPrompt') : displayPauseShortcut}
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t('shortcuts_hint')}
        </p>

        {shortcutError ? (
          <p className="mt-3 rounded-xl border border-red-300/70 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {shortcutError}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-red-200/70 bg-red-50/70 p-4 shadow-sm dark:border-red-500/30 dark:bg-red-500/8">
        <h3 className="text-sm font-semibold text-red-700 dark:text-red-200">{t('reset_title')}</h3>
        <p className="mt-1 text-xs text-red-600/90 dark:text-red-200/90">
          {t('reset_description')}
        </p>
        <button
          type="button"
          onClick={() => void handleResetAll()}
          disabled={resetting}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-300/80 bg-white/80 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
        >
          <RotateCcw size={15} />
          {resetting ? t('btn_resetting') : t('btn_resetAll')}
        </button>
      </div>
    </section>
  );
}
