import { AudioLines, Mic, Monitor, RotateCcw } from 'lucide-react';
import type { MeetingWithPreview } from '../../types';
import { formatDate, formatDuration, normalizeAudioSource, statusClasses } from './meetingUtils';

type MeetingCardProps = {
  meeting: MeetingWithPreview;
  onClick: (id: number) => void;
  onRetranscribe?: (id: number) => void;
  selected?: boolean;
  selectionMode?: boolean;
  onSelect?: (id: number) => void;
};

function sourceBadge(meeting: MeetingWithPreview) {
  const source = normalizeAudioSource(meeting.audio_sources);

  if (source === 'mic') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warm-300/80 bg-warm-50/80 px-2 py-0.5 text-[11px] font-medium text-warm-600 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-200">
        <Mic size={11} /> Mic
      </span>
    );
  }

  if (source === 'system') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warm-300/80 bg-warm-50/80 px-2 py-0.5 text-[11px] font-medium text-warm-600 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-200">
        <Monitor size={11} /> System
      </span>
    );
  }

  if (source === 'both') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warm-300/80 bg-warm-50/80 px-2 py-0.5 text-[11px] font-medium text-warm-600 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-200">
        <AudioLines size={11} /> Both
      </span>
    );
  }

  return null;
}

export function MeetingCard({
  meeting,
  onClick,
  onRetranscribe,
  selected = false,
  selectionMode = false,
  onSelect,
}: MeetingCardProps) {
  const words = meeting.summary_preview?.trim() ? meeting.summary_preview.trim().split(/\s+/).length : 0;
  const showSelection = Boolean(selectionMode && onSelect);

  return (
    <article className="rounded-xl border border-warm-200/70 bg-white/70 p-4 shadow-sm transition hover:border-warm-300 dark:border-warm-700/70 dark:bg-warm-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {showSelection ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect?.(meeting.id)}
              className="mt-1 h-4 w-4 rounded border-warm-300 accent-accent"
            />
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => onClick(meeting.id)}
              className="text-left text-base font-semibold text-warm-700 transition hover:text-accent dark:text-warm-100"
            >
              {meeting.title}
            </button>
            <p className="mt-1 text-xs text-warm-500 dark:text-warm-300">
              {formatDate(meeting.started_at)} • {formatDuration(meeting.duration_seconds)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusClasses(meeting.status)}`}>
            {meeting.status}
          </span>
          {sourceBadge(meeting)}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-warm-600 dark:text-warm-200">
        {meeting.summary_preview?.trim() || 'No summary available yet.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-warm-500 dark:text-warm-300">
        <span>{meeting.segment_count} segments</span>
        <span>•</span>
        <span>{words} preview words</span>

        {meeting.status === 'recovered' && onRetranscribe ? (
          <button
            type="button"
            onClick={() => onRetranscribe(meeting.id)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-500/10"
          >
            <RotateCcw size={12} />
            Re-transcribe
          </button>
        ) : null}
      </div>
    </article>
  );
}
