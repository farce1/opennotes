import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../lib/settings';
import type { AppTheme } from '../types';

type ResolvedTheme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    let cancelled = false;

    getSetting('theme').then((value) => {
      if (!cancelled) {
        setThemeState(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const updateResolved = () => {
      const resolved: ResolvedTheme =
        theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme;

      setResolvedTheme(resolved);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    };

    updateResolved();

    mediaQuery.addEventListener('change', updateResolved);
    return () => {
      mediaQuery.removeEventListener('change', updateResolved);
    };
  }, [theme]);

  const setTheme = async (newTheme: AppTheme) => {
    setThemeState(newTheme);
    await setSetting('theme', newTheme);
  };

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}
