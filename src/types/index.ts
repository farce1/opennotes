export type AppView = 'record' | 'library' | 'settings';
export type AppTheme = 'light' | 'dark' | 'system';
export type RecordingState = 'idle' | 'recording' | 'processing';
export type SessionPhase = 'idle' | 'recording' | 'paused' | 'stopping';

export interface Meeting {
  id: number;
  title: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'recording' | 'paused' | 'processing' | 'completed' | 'failed' | 'recovered';
  audio_path: string | null;
  audio_sources: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type SortField = 'date' | 'duration' | 'title';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'card' | 'compact';
export type SettingsTab = 'general' | 'recording' | 'transcription' | 'summary' | 'data' | 'about';

export interface LibraryFilters {
  search: string;
  status: Meeting['status'] | '';
  durationRange: 'all' | 'short' | 'medium' | 'long';
  audioSource: string;
  dateFrom: string;
  dateTo: string;
}

export interface DateSection {
  label: string;
  items: MeetingWithPreview[];
}

export interface SearchResult {
  id: number;
  title: string;
  started_at: string;
  status: Meeting['status'];
  duration_seconds: number | null;
  audio_sources: string | null;
  snippet: string;
}

export interface MeetingWithPreview extends Meeting {
  summary_preview: string | null;
  segment_count: number;
}

export interface AppSettings {
  theme: AppTheme;
  recordingShortcut: string;
  dataDirectory: string;
  defaultAudioSource: 'mic' | 'system' | 'both';
  preferredMicDevice: string | null;
  transcriptionLanguage: string;
  ollamaModel: string;
  ollamaServerUrl: string;
  autoSummary: boolean;
}

export interface TranscriptSegment {
  text: string;
  elapsedMs: number;
  index: number;
}

export interface SessionStatePayload {
  phase: SessionPhase;
  meetingId: number | null;
  transcriptionDegraded: boolean;
  startedAt: string | null;
}

export interface TranscriptRow {
  segment_index: number;
  text: string;
  start_time_ms: number;
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

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  modelReady: boolean;
  modelName: string;
}

export type OllamaSetupPhase =
  | 'checking'
  | 'not_installed'
  | 'not_running'
  | 'model_not_pulled'
  | 'pulling'
  | 'ready'
  | 'error';

export type OllamaPullEvent =
  | { event: 'progress'; data: { status: string; completed: number; total: number } }
  | { event: 'complete' }
  | { event: 'error'; data: { message: string } };

export type LlmTokenEvent =
  | { event: 'token'; data: { text: string; done: boolean } }
  | { event: 'error'; data: { message: string } }
  | { event: 'titleExtracted'; data: { title: string } };
