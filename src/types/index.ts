export type AppView = 'record' | 'library' | 'settings';
export type AppTheme = 'light' | 'dark' | 'system';
export type RecordingState = 'idle' | 'recording' | 'processing';

export interface Meeting {
  id: number;
  title: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  theme: AppTheme;
  recordingShortcut: string;
  dataDirectory: string;
}
