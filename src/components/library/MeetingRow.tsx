import { AudioLines, Mic, Monitor, RotateCcw } from 'lucide-react';
import type { MeetingWithPreview } from '../../types';
import { formatDuration, formatShortDate, normalizeAudioSource, statusClasses } from './meetingUtils';

type MeetingRowProps = {
  meeting: MeetingWithPreview;
  onClick: (id: number) => void;
  onRetranscribe?: (id: number) => void;
  selected?: boolean;
  selectionMode?: boolean;
  onSelect?: (id: number) => void;
};

function sourceIcon(audioSource: string | null) {
  const source = normalizeAudioSource(audioSource);

  if (source === 'mic') {
    return <Mic size={13} />;
  }

  if (source === 'system') {
    return <Monitor size={13} />;
  }

  if (source === 'both') {
    return <AudioLines size={13} />;
  }

  return null;
}

export function MeetingRow({
  meeting,
  onClick,
  onRetranscribe,
  selected = false,
  selectionMode = false,
  onSelect,
}: MeetingRowProps) {
  const showSelection = Boolean(selectionMode && onSelect);

  return (
    <article className="rounded-lg border border-warm-200/70 bg-white/70 px-3 py-2 transition hover:border-warm-300 dark:border-warm-700/70 dark:bg-warm-900/30">
      <div className="flex items-center gap-3">
        {showSelection ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(meeting.id)}
            className="h-4 w-4 rounded border-warm-300 accent-accent"
          />
        ) : null}

        <button
          type="button"
          onClick={() => onClick(meeting.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-warm-700 transition hover:text-accent dark:text-warm-100"
        >
          {meeting.title}
        </button>

        <span className="hidden text-xs text-warm-500 dark:text-warm-300 sm:inline">{formatShortDate(meeting.started_at)}</span>
        <span className="hidden text-xs text-warm-500 dark:text-warm-300 md:inline">{formatDuration(meeting.duration_seconds)}</span>

        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClasses(meeting.status)}`}>
          {meeting.status}
        </span>

        <span className="text-warm-400 dark:text-warm-300">{sourceIcon(meeting.audio_sources)}</span>

        <span className="hidden max-w-[240px] truncate text-xs text-warm-500 dark:text-warm-300 lg:inline">
          {meeting.summary_preview?.trim() || 'No summary available'}
        </span>

        {meeting.status === 'recovered' && onRetranscribe ? (
          <button
            type="button"
            onClick={() => onRetranscribe(meeting.id)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-500/10"
          >
            <RotateCcw size={11} />
            Re
          </button>
        ) : null}
      </div>
    </article>
  );
}
