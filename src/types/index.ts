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

export interface TranscriptSegment {
  text: string;
  elapsedMs: number;
  index: number;
}

export type ModelStatus =
  | 'unknown'
  | 'checking'
  | 'not_ready'
  | 'downloading'
  | 'extracting'
  | 'ready'
  | 'error';

export type TranscriptEvent =
  | { event: 'segment'; data: { text: string; elapsedMs: number; index: number } }
  | { event: 'transcribing'; data: { active: boolean } };

export type DownloadEvent =
  | { event: 'progress'; data: { downloadedBytes: number; totalBytes: number } }
  | { event: 'extracting' }
  | { event: 'complete' }
  | { event: 'error'; data: { message: string } };
