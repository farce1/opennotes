import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../lib/settings';
import type { AppSettings } from '../types';

export function useSetting<K extends keyof AppSettings>(key: K) {
  const [value, setValue] = useState<AppSettings[K] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSetting(key).then((loaded) => {
      if (!cancelled) {
        setValue(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    async (nextValue: AppSettings[K]) => {
      setValue(nextValue);
      await setSetting(key, nextValue);
    },
    [key],
  );

  return [value, update] as const;
}
