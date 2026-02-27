import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BookOpen, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { getDb } from '../lib/db';
import type { Meeting } from '../types';

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(durationSeconds: number | null): string {
  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
    return 'In progress';
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function statusClasses(status: Meeting['status']): string {
  if (status === 'completed') {
    return 'border-emerald-300/80 bg-emerald-100/70 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200';
  }

  if (status === 'recovered') {
    return 'border-amber-300/80 bg-amber-100/70 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200';
  }

  if (status === 'failed') {
    return 'border-red-300/80 bg-red-100/70 text-red-700 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200';
  }

  return 'border-warm-300/70 bg-white/70 text-warm-700 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-100';
}

export function LibraryView() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const db = await getDb();
      const rows = await db.select<Meeting[]>(
        'SELECT id, title, started_at, ended_at, duration_seconds, status, audio_path, audio_sources, created_at, updated_at FROM meetings ORDER BY started_at DESC',
      );
      setMeetings(rows);
    } catch {
      setError('Failed to load meetings from local database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<number>('sessions-recovered', () => {
      if (!disposed) {
        void loadMeetings();
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [loadMeetings]);

  const hasMeetings = useMemo(() => meetings.length > 0, [meetings.length]);

  const onOpenMeeting = (meetingId: number) => {
    navigate('/meeting-complete', {
      state: {
        meetingId,
      },
    });
  };

  const onRetranscribe = async (meetingId: number) => {
    try {
      await invoke('retranscribe_meeting', { meetingId });
      setActionMessage('Re-transcription started.');
    } catch (err) {
      setActionMessage(String(err) || 'Re-transcription is not yet available.');
    }
  };

  return (
    <section className="h-full min-h-[calc(100vh-3rem)] rounded-xl border border-warm-200/80 bg-white/60 p-6 shadow-sm dark:border-warm-700/70 dark:bg-warm-800/40">
      <h1 className="text-2xl font-semibold text-warm-700 dark:text-warm-100">Meeting Library</h1>

      {loading ? (
        <p className="mt-6 text-sm text-warm-500 dark:text-warm-300">Loading meetings…</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {actionMessage ? (
        <p className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {actionMessage}
        </p>
      ) : null}

      {!loading && !hasMeetings ? (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center text-warm-400 dark:text-warm-300">
          <BookOpen size={52} strokeWidth={1.8} />
          <p className="text-lg font-medium">No meetings yet</p>
          <p className="text-sm text-warm-500 dark:text-warm-400">Your recorded meetings will appear here</p>
        </div>
      ) : null}

      {hasMeetings ? (
        <div className="mt-6 space-y-3">
          {meetings.map((meeting) => (
            <article
              key={meeting.id}
              className="rounded-xl border border-warm-200/70 bg-white/70 p-4 shadow-sm transition hover:border-warm-300 dark:border-warm-700/70 dark:bg-warm-900/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(meeting.id)}
                    className="text-left text-base font-semibold text-warm-700 transition hover:text-accent dark:text-warm-100"
                  >
                    {meeting.title}
                  </button>
                  <p className="mt-1 text-xs text-warm-500 dark:text-warm-300">
                    {formatDate(meeting.started_at)} • {formatDuration(meeting.duration_seconds)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusClasses(meeting.status)}`}>
                    {meeting.status}
                  </span>

                  {meeting.status === 'recovered' ? (
                    <span className="rounded-full border border-amber-300/80 bg-amber-100/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                      Recovered
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(meeting.status === 'completed' || meeting.status === 'recovered') && (
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(meeting.id)}
                    className="rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-medium text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
                  >
                    View Transcript
                  </button>
                )}

                {meeting.status === 'recovered' ? (
                  <button
                    type="button"
                    onClick={() => void onRetranscribe(meeting.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-500/10"
                  >
                    <RotateCcw size={12} />
                    Re-transcribe
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
