import type { AppSettings } from '../types';

export const APP_NAME = 'openNotes';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  recordingShortcut: 'CommandOrControl+Shift+R',
  dataDirectory: '~/.opennotes',
  defaultAudioSource: 'both',
  preferredMicDevice: null,
  transcriptionLanguage: 'en',
  ollamaModel: 'phi4-mini',
  ollamaServerUrl: 'http://localhost:11434',
  autoSummary: true,
};

export const DB_PATH = 'sqlite:~/.opennotes/data.db';
