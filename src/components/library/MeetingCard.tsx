import { AudioLines, Download, Mic, Monitor, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';

import type { MeetingWithPreview } from '../../types';
import type { ExportFormat } from '../../lib/export';
import { formatDate, formatDuration, normalizeAudioSource, statusClasses } from './meetingUtils';

type MeetingCardProps = {
  meeting: MeetingWithPreview;
  onClick: (id: number) => void;
  showTrash: boolean;
  selected: boolean;
  selectionMode: boolean;
  onSelect: (id: number) => void;
  onStartRename: (id: number, currentTitle: string) => void;
  editingId: number | null;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onExport: (id: number, format: ExportFormat) => void;
  onSoftDelete: (id: number) => void;
  onRestore: (id: number) => void;
  onRetranscribe?: (id: number) => void;
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
  showTrash,
  selected,
  selectionMode,
  onSelect,
  onStartRename,
  editingId,
  editTitle,
  onEditTitleChange,
  onCommitRename,
  onCancelRename,
  onExport,
  onSoftDelete,
  onRestore,
  onRetranscribe,
}: MeetingCardProps) {
  const words = meeting.summary_preview?.trim() ? meeting.summary_preview.trim().split(/\s+/).length : 0;
  const isEditing = editingId === meeting.id;

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommitRename();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelRename();
    }
  };

  const onExportClick = (format: ExportFormat, event: MouseEvent<HTMLButtonElement>) => {
    onExport(meeting.id, format);
    const details = event.currentTarget.closest('details');
    if (details) {
      details.removeAttribute('open');
    }
  };

  return (
    <article className="group rounded-xl border border-warm-200/70 bg-white/70 p-4 shadow-sm transition hover:border-warm-300 dark:border-warm-700/70 dark:bg-warm-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(meeting.id)}
            className={[
              'mt-1 h-4 w-4 rounded border-warm-300 accent-accent transition',
              selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            ].join(' ')}
          />

          <div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(event) => onEditTitleChange(event.target.value)}
                  onBlur={onCommitRename}
                  onKeyDown={onTitleKeyDown}
                  className="w-full rounded-md border border-warm-300 bg-warm-50 px-2 py-1 text-base font-semibold text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-600 dark:bg-warm-900 dark:text-warm-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onClick(meeting.id)}
                  className="text-left text-base font-semibold text-warm-700 transition hover:text-accent dark:text-warm-100"
                >
                  {meeting.title}
                </button>
              )}

              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => onStartRename(meeting.id, meeting.title)}
                  className="opacity-0 transition group-hover:opacity-100 rounded-md p-1 text-warm-400 hover:bg-warm-100 hover:text-warm-700 dark:hover:bg-warm-800 dark:hover:text-warm-100"
                  aria-label="Rename meeting"
                >
                  <Pencil size={13} />
                </button>
              ) : null}
            </div>

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

        <div className="ml-auto flex items-center gap-2">
          <details className="relative">
            <summary className="list-none inline-flex cursor-pointer items-center gap-1 rounded-lg border border-warm-300 px-2.5 py-1 text-xs font-medium text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800">
              <Download size={12} />
              Export
            </summary>
            <div className="absolute right-0 z-20 mt-1 min-w-[150px] rounded-lg border border-warm-200 bg-white p-1 shadow-lg dark:border-warm-700 dark:bg-warm-900">
              <button type="button" onClick={(event) => onExportClick('md', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-warm-100 dark:hover:bg-warm-800">Markdown</button>
              <button type="button" onClick={(event) => onExportClick('txt', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-warm-100 dark:hover:bg-warm-800">Plain Text</button>
              <button type="button" onClick={(event) => onExportClick('json', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-warm-100 dark:hover:bg-warm-800">JSON</button>
              <button type="button" onClick={(event) => onExportClick('pdf', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-warm-100 dark:hover:bg-warm-800">PDF</button>
            </div>
          </details>

          {showTrash ? (
            <button
              type="button"
              onClick={() => onRestore(meeting.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100/70 dark:border-emerald-500 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <Undo2 size={12} />
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSoftDelete(meeting.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100/70 dark:border-red-500 dark:text-red-200 dark:hover:bg-red-500/10"
            >
              <Trash2 size={12} />
              Delete
            </button>
          )}

          {meeting.status === 'recovered' && onRetranscribe && !showTrash ? (
            <button
              type="button"
              onClick={() => onRetranscribe(meeting.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100/70 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-500/10"
            >
              <RotateCcw size={12} />
              Re-transcribe
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
