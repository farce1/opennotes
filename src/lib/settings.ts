import { Store } from '@tauri-apps/plugin-store';
import { DEFAULT_SETTINGS } from './constants';
import type { AppSettings } from '../types';

let store: Store | null = null;

export async function getSettingsStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('settings.json', {
      defaults: { ...DEFAULT_SETTINGS },
      autoSave: 500,
    });

    const hasTheme = await store.has('theme');

    if (!hasTheme) {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await store.set(key, value);
      }
    }
  }

  return store;
}

export async function getSetting<K extends keyof AppSettings>(
  key: K,
): Promise<AppSettings[K]> {
  const s = await getSettingsStore();
  const value = await s.get<AppSettings[K]>(key);

  return value ?? DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  const s = await getSettingsStore();
  await s.set(key, value);
}
