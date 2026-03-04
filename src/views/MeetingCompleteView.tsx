import { invoke } from '@tauri-apps/api/core';
import { Copy, Download, Plus, RotateCcw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { SummaryError } from '../components/SummaryError';
import { SummaryExport } from '../components/SummaryExport';
import { SummaryPanel } from '../components/SummaryPanel';
import { useSummary } from '../hooks/useSummary';
import { getDb } from '../lib/db';
import { getSetting, setSetting } from '../lib/settings';
import type { Meeting, TranscriptRow, TranscriptSegment } from '../types';

type MeetingCompleteRouteState = {
  meetingId: number;
  autoGenerate?: boolean;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function buildTranscriptLines(segments: TranscriptSegment[]): string[] {
  return segments.map((segment) => `${formatElapsed(segment.elapsedMs)}  ${segment.text}`);
}

function toMarkdown(title: string, segments: TranscriptSegment[]): string {
  const body = segments
    .map((segment) => `**${formatElapsed(segment.elapsedMs)}** ${segment.text}`)
    .join('\n\n');

  return `# ${title}\n\n${body}`;
}

function mapRowsToSegments(rows: TranscriptRow[]): TranscriptSegment[] {
  return rows.map((row) => ({
    text: row.text,
    elapsedMs: row.start_time_ms,
    index: row.segment_index,
  }));
}

export function MeetingCompleteView() {
  const { t } = useTranslation('meeting');
  const navigate = useNavigate();
  const location = useLocation();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [retranscribeMessage, setRetranscribeMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary');
  const [autoGenerateTriggered, setAutoGenerateTriggered] = useState(false);
  const [summaryChecked, setSummaryChecked] = useState(false);
  const [hadSummaryOnLoad, setHadSummaryOnLoad] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [titleSaveState, setTitleSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const state = (location.state as MeetingCompleteRouteState | null) ?? null;
  const meetingId = typeof state?.meetingId === 'number' ? state.meetingId : null;

  const {
    summaryText,
    generating,
    loading: summaryLoading,
    title,
    hasExistingSummary,
    edited,
    errorMessage: summaryError,
    llmModel,
    generate,
    saveEdit,
    setText,
    saveTitle,
    loadExisting,
  } = useSummary();

  useEffect(() => {
    if (!meetingId) {
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setSummaryChecked(false);
      setHadSummaryOnLoad(false);
      setAutoGenerateTriggered(false);

      try {
        const db = await getDb();
        const meetings = await db.select<Meeting[]>(
          'SELECT id, title, started_at, ended_at, duration_seconds, status, audio_path, audio_sources, created_at, updated_at FROM meetings WHERE id = $1 LIMIT 1',
          [meetingId],
        );

        const selectedMeeting = meetings[0] ?? null;
        if (!selectedMeeting) {
          throw new Error('Meeting not found.');
        }

        const rows = await invoke<TranscriptRow[]>('get_transcript_page', {
          meetingId,
          offset: 0,
          limit: 10000,
        });

        const existingSummary = await loadExisting(meetingId);

        if (!active) {
          return;
        }

        setMeeting(selectedMeeting);
        setSegments(mapRowsToSegments(rows));
        setHadSummaryOnLoad(Boolean(existingSummary));
      } catch {
        if (!active) {
          return;
        }

        setLoadError(t('loadError_dbFailed'));
      } finally {
        if (active) {
          setSummaryChecked(true);
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [loadExisting, meetingId, t]);

  useEffect(() => {
    if (!meetingId || !state?.autoGenerate || !summaryChecked || autoGenerateTriggered || hadSummaryOnLoad || generating) {
      return;
    }

    setAutoGenerateTriggered(true);
    void generate(meetingId);
  }, [autoGenerateTriggered, generate, generating, hadSummaryOnLoad, meetingId, state?.autoGenerate, summaryChecked]);

  const fallbackTitle = useMemo(
    () => `Meeting — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    [],
  );

  useEffect(() => {
    const nextTitle = title ?? meeting?.title ?? fallbackTitle;
    setTitleInput(nextTitle);
  }, [fallbackTitle, meeting?.title, title]);

  const transcriptLines = useMemo(() => buildTranscriptLines(segments), [segments]);

  const onCopyTranscript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptLines.join('\n'));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  }, [transcriptLines]);

  const onExportTranscript = useCallback(() => {
    const markdown = toMarkdown(titleInput || fallbackTitle, segments);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeTitle = (titleInput || fallbackTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    anchor.href = url;
    anchor.download = `${safeTitle || 'meeting-transcript'}.md`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, [fallbackTitle, segments, titleInput]);

  const onRetranscribe = useCallback(() => {
    setRetranscribeMessage(t('transcript_retranscribeNotAvailable'));
  }, [t]);

  const onSaveSummary = useCallback(
    async (content: string) => {
      if (!meetingId) {
        return;
      }

      await saveEdit(meetingId, content);
    },
    [meetingId, saveEdit],
  );

  const onRegenerateSummary = useCallback(() => {
    if (!meetingId) {
      return;
    }

    void generate(meetingId);
  }, [generate, meetingId]);

  const onSaveTitle = useCallback(async () => {
    if (!meetingId || !meeting) {
      return;
    }

    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === meeting.title) {
      return;
    }

    setTitleSaveState('saving');

    try {
      await saveTitle(meetingId, trimmed);
      setMeeting((previous) =>
        previous
          ? {
              ...previous,
              title: trimmed,
            }
          : previous,
      );
      setTitleSaveState('saved');
      window.setTimeout(() => setTitleSaveState('idle'), 1200);
    } catch {
      setTitleSaveState('error');
      window.setTimeout(() => setTitleSaveState('idle'), 1800);
    }
  }, [meeting, meetingId, saveTitle, titleInput]);

  if (!meetingId) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <TriangleAlert className="mx-auto text-amber-500" size={34} />
          <h1 className="text-xl font-semibold text-gray-700 dark:text-gray-50">{t('noTranscript_title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('noTranscript_description')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/record')}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {t('noTranscript_goToRecord')}
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('loading')}</p>
      </section>
    );
  }

  if (loadError || !meeting) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <TriangleAlert className="mx-auto text-amber-500" size={34} />
          <h1 className="text-xl font-semibold text-gray-700 dark:text-gray-50">{t('loadError_title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{loadError ?? t('loadError_fallback')}</p>
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            {t('loadError_openLibrary')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] flex-col p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              onBlur={() => void onSaveTitle()}
              className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-3xl font-semibold leading-tight text-gray-700 outline-none ring-accent transition focus:border-gray-200 focus:ring-2 sm:text-4xl dark:text-gray-50 dark:focus:border-gray-700"
            />
            {meeting.status === 'recovered' ? (
              <span className="rounded-full bg-amber-100/70 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                {t('header_recovered')}
              </span>
            ) : null}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('header_subtitle')}
          </p>

          {titleSaveState === 'saving' ? <p className="text-xs text-gray-500 dark:text-gray-400">{t('title_saving')}</p> : null}
          {titleSaveState === 'saved' ? <p className="text-xs text-emerald-600 dark:text-emerald-300">{t('title_saved')}</p> : null}
          {titleSaveState === 'error' ? <p className="text-xs text-red-600 dark:text-red-300">{t('title_saveFailed')}</p> : null}
        </div>
      </header>

      <div className="mt-4 flex items-center gap-2 border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'summary'
              ? 'border-b-2 border-accent font-semibold text-accent'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          {t('tab_summary')}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transcript')}
          className={`px-3 py-2 text-sm transition ${
            activeTab === 'transcript'
              ? 'border-b-2 border-accent font-semibold text-accent'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          {t('tab_transcript')}
        </button>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto">
        {activeTab === 'summary' ? (
          <div className="space-y-3">
            {summaryLoading && !summaryText ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('summary_loading')}</p>
            ) : null}

            {summaryError ? (
              <SummaryError
                errorMessage={summaryError}
                onRetry={onRegenerateSummary}
                onSwitchModel={async (model) => {
                  await setSetting('ollamaModel', model);
                  if (meetingId) {
                    void generate(meetingId);
                  }
                }}
                onCheckConnection={async () => {
                  try {
                    const currentModel = await getSetting('ollamaModel');
                    await invoke('check_ollama_status', {
                      model: currentModel || undefined,
                    });
                  } catch {
                    // Connection check failed — error is surfaced on the next generation attempt.
                  }
                }}
              />
            ) : null}

            <SummaryPanel
              summaryText={summaryText}
              generating={generating}
              edited={edited}
              hasExistingSummary={hasExistingSummary}
              onTextChange={setText}
              onRegenerate={onRegenerateSummary}
              onSave={onSaveSummary}
              meetingId={meeting.id}
              generatedWithModel={llmModel}
            />

            <SummaryExport summaryText={summaryText} meetingTitle={titleInput || fallbackTitle} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
              {segments.length ? (
                <div className="space-y-3">
                  {segments.map((segment) => (
                    <article key={segment.index} className="grid grid-cols-[auto_1fr] gap-x-4">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{formatElapsed(segment.elapsedMs)}</span>
                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-100">{segment.text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('transcript_empty')}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onCopyTranscript()}
                disabled={!segments.length}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Copy size={13} />
                {copyState === 'copied' ? t('transcript_copied') : t('transcript_copy')}
              </button>

              <button
                type="button"
                onClick={onExportTranscript}
                disabled={!segments.length}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Download size={13} />
                {t('transcript_exportMarkdown')}
              </button>

              {meeting.status === 'recovered' ? (
                <button
                  type="button"
                  onClick={onRetranscribe}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-500/10"
                >
                  <RotateCcw size={13} />
                  {t('transcript_retranscribe')}
                </button>
              ) : null}

              {copyState === 'error' ? <span className="text-xs text-red-600 dark:text-red-300">{t('transcript_clipboardFailed')}</span> : null}
              {retranscribeMessage ? <span className="text-xs text-amber-700 dark:text-amber-200">{retranscribeMessage}</span> : null}
            </div>
          </div>
        )}
      </div>

      <footer className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => navigate('/record')}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          <Plus size={15} />
          {t('btn_newRecording')}
        </button>
      </footer>
    </section>
  );
}
