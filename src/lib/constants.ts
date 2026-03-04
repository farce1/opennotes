import { appLocalDataDir, join } from '@tauri-apps/api/path';

import type { AppSettings } from '../types';

export const APP_NAME = 'openNotes';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  appLanguage: 'en',
  summaryLanguage: 'en',
  lastUsedTemplateId: 'standard',
  recordingShortcut: 'CommandOrControl+Shift+R',
  pauseShortcut: 'CommandOrControl+Shift+P',
  dataDirectory: '',
  defaultAudioSource: 'both',
  preferredMicDevice: null,
  transcriptionLanguage: 'en',
  ollamaModel: 'phi4-mini',
  ollamaServerUrl: 'http://localhost:11434',
  autoSummary: true,
};

let cachedDataDir: string | null = null;

export async function getDataDirectory(): Promise<string> {
  if (!cachedDataDir) {
    cachedDataDir = await appLocalDataDir();
  }

  return cachedDataDir;
}

export async function getDbPath(): Promise<string> {
  const dataDir = await getDataDirectory();
  const dbFile = await join(dataDir, 'data.db');
  return `sqlite:${dbFile}`;
}
