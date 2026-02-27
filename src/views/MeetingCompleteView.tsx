import { Check, Copy, Download, Plus, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { getDb } from '../lib/db';
import type { TranscriptSegment } from '../types';

type MeetingCompleteRouteState = {
  segments: TranscriptSegment[];
  title: string;
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

export function MeetingCompleteView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const didPersistRef = useRef(false);

  const state = (location.state as MeetingCompleteRouteState | null) ?? null;
  const segments = state?.segments ?? [];
  const title =
    state?.title ??
    `Meeting — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const transcriptLines = useMemo(() => buildTranscriptLines(segments), [segments]);

  useEffect(() => {
    if (!segments.length || didPersistRef.current) {
      return;
    }

    didPersistRef.current = true;

    const persistTranscript = async () => {
      setSaveState('saving');

      try {
        const db = await getDb();
        const endedAt = new Date().toISOString();
        const lastElapsed = segments[segments.length - 1]?.elapsedMs ?? 0;
        const startedAt = new Date(Date.now() - Math.max(0, lastElapsed)).toISOString();
        const durationSeconds = Math.max(0, Math.floor(lastElapsed / 1000));

        await db.execute('BEGIN');

        const meetingResult = await db.execute(
          'INSERT INTO meetings (title, started_at, ended_at, duration_seconds, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [title, startedAt, endedAt, durationSeconds, 'completed', startedAt, endedAt]
        );

        const meetingId = meetingResult.lastInsertId;
        if (typeof meetingId !== 'number') {
          throw new Error('Failed to create meeting record for transcript persistence.');
        }

        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index];
          const nextSegment = segments[index + 1];
          const startMs = Math.max(0, Math.floor(segment.elapsedMs));
          const endMs = Math.max(startMs, Math.floor(nextSegment?.elapsedMs ?? startMs + 1000));

          await db.execute(
            'INSERT INTO transcripts (meeting_id, segment_index, text, start_time_ms, end_time_ms, confidence, is_final) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [meetingId, segment.index, segment.text, startMs, endMs, null, 1]
          );
        }

        await db.execute('COMMIT');
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    };

    void persistTranscript();
  }, [segments, title]);

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

  if (!segments.length) {
    return (
      <section className="flex h-full min-h-[calc(100vh-3rem)] items-center justify-center rounded-xl border border-warm-200/80 bg-white/60 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
        <div className="max-w-md space-y-4 text-center">
          <TriangleAlert className="mx-auto text-amber-500" size={34} />
          <h1 className="text-xl font-semibold text-warm-700 dark:text-warm-50">No transcript available</h1>
          <p className="text-sm text-warm-500 dark:text-warm-300">
            Start a recording and speak to generate transcript segments before opening this view.
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

  return (
    <section className="flex h-full min-h-[calc(100vh-3rem)] flex-col rounded-xl border border-warm-200/80 bg-white/70 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-warm-700 dark:text-warm-50">{title}</h1>
          <p className="mt-1 text-sm text-warm-500 dark:text-warm-300">Meeting complete. Transcript ready for copy or export.</p>
        </div>
        <div className="text-xs text-warm-500 dark:text-warm-300">
          {saveState === 'saving' ? 'Saving transcript…' : null}
          {saveState === 'saved' ? 'Transcript saved to local database.' : null}
          {saveState === 'error' ? 'Unable to save transcript automatically.' : null}
        </div>
      </header>

      <div className="mt-5 flex-1 overflow-y-auto rounded-xl border border-warm-200/80 bg-warm-50/70 p-4 dark:border-warm-700/70 dark:bg-warm-900/30">
        <div className="space-y-3">
          {segments.map((segment) => (
            <article key={segment.index} className="grid grid-cols-[auto_1fr] gap-x-4">
              <span className="font-mono text-xs text-warm-500 dark:text-warm-300">{formatElapsed(segment.elapsedMs)}</span>
              <p className="text-sm leading-relaxed text-warm-700 dark:text-warm-100">{segment.text}</p>
            </article>
          ))}
        </div>
      </div>

      <footer className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onCopy()}
          className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-4 py-2 text-sm font-semibold text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
        >
          {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
          {copyState === 'copied' ? 'Copied' : 'Copy'}
        </button>

        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-4 py-2 text-sm font-semibold text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
        >
          <Download size={15} />
          Export Markdown
        </button>

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
      </footer>
    </section>
  );
}
