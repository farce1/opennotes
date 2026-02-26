import type { AppSettings } from '../types';

export const APP_NAME = 'openNotes';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  recordingShortcut: 'CommandOrControl+Shift+R',
  dataDirectory: '~/.opennotes',
};

export const DB_PATH = 'sqlite:~/.opennotes/data.db';
