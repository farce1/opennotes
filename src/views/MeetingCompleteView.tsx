import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Download, Plus, RotateCcw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { getDb } from '../lib/db';
import type { Meeting, TranscriptRow, TranscriptSegment } from '../types';

type MeetingCompleteRouteState = {
  meetingId: number;
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
  const navigate = useNavigate();
  const location = useLocation();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [retranscribeMessage, setRetranscribeMessage] = useState<string | null>(null);

  const state = (location.state as MeetingCompleteRouteState | null) ?? null;
  const meetingId = typeof state?.meetingId === 'number' ? state.meetingId : null;

  useEffect(() => {
    if (!meetingId) {
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

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

        if (!active) {
          return;
        }

        setMeeting(selectedMeeting);
        setSegments(mapRowsToSegments(rows));
      } catch {
        if (!active) {
          return;
        }

        setLoadError('Failed to load meeting transcript from local database.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [meetingId]);

  const title =
    meeting?.title ??
    `Meeting — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const transcriptLines = useMemo(() => buildTranscriptLines(segments), [segments]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptLines.join('\n'));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  }, [transcriptLines]);

  const onExport = useCallback(() => {
    const markdown = toMarkdown(title, segments);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    anchor.href = url;
    anchor.download = `${safeTitle || 'meeting-transcript'}.md`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, [segments, title]);

  const onRetranscribe = useCallback(() => {
    setRetranscribeMessage('Re-transcription is not yet available. Coming in a future update.');
  }, []);

  if (!meetingId) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
        <div className="max-w-md space-y-4 text-center">
          <TriangleAlert className="mx-auto text-amber-500" size={34} />
          <h1 className="text-xl font-semibold text-warm-700 dark:text-warm-50">No transcript available</h1>
          <p className="text-sm text-warm-500 dark:text-warm-300">
            Start a recording and complete a session before opening this view.
          </p>
          <button
            type="button"
            onClick={() => navigate('/record')}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            Go to Record
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
        <p className="text-sm text-warm-600 dark:text-warm-200">Loading meeting transcript…</p>
      </section>
    );
  }

  if (loadError || !meeting) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
        <div className="max-w-md space-y-4 text-center">
          <TriangleAlert className="mx-auto text-amber-500" size={34} />
          <h1 className="text-xl font-semibold text-warm-700 dark:text-warm-50">Unable to load transcript</h1>
          <p className="text-sm text-warm-500 dark:text-warm-300">
            {loadError ?? 'Meeting data could not be loaded.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            Open Library
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] flex-col rounded-xl border border-warm-200/80 bg-white/70 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-warm-700 dark:text-warm-50">{title}</h1>
            {meeting.status === 'recovered' ? (
              <span className="rounded-full border border-amber-300/80 bg-amber-100/70 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                Recovered
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-warm-500 dark:text-warm-300">
            Meeting complete. Transcript loaded from local database.
          </p>
        </div>
      </header>

      <div className="mt-5 flex-1 overflow-y-auto rounded-xl border border-warm-200/80 bg-warm-50/70 p-4 dark:border-warm-700/70 dark:bg-warm-900/30">
        {segments.length ? (
          <div className="space-y-3">
            {segments.map((segment) => (
              <article key={segment.index} className="grid grid-cols-[auto_1fr] gap-x-4">
                <span className="font-mono text-xs text-warm-500 dark:text-warm-300">{formatElapsed(segment.elapsedMs)}</span>
                <p className="text-sm leading-relaxed text-warm-700 dark:text-warm-100">{segment.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-warm-500 dark:text-warm-300">No transcript segments were saved for this meeting.</p>
        )}
      </div>

      <footer className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onCopy()}
          disabled={!segments.length}
          className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-4 py-2 text-sm font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
        >
          {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
          {copyState === 'copied' ? 'Copied' : 'Copy'}
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={!segments.length}
          className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-4 py-2 text-sm font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
        >
          <Download size={15} />
          Export Markdown
        </button>

        {meeting.status === 'recovered' ? (
          <button
            type="button"
            onClick={onRetranscribe}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-500/10"
          >
            <RotateCcw size={15} />
            Re-transcribe
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => navigate('/record')}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
        >
          <Plus size={15} />
          New Recording
        </button>

        {copyState === 'error' ? (
          <span className="text-xs text-red-600 dark:text-red-300">Clipboard access failed. Try export instead.</span>
        ) : null}

        {retranscribeMessage ? (
          <span className="text-xs text-amber-700 dark:text-amber-200">{retranscribeMessage}</span>
        ) : null}
      </footer>
    </section>
  );
}
