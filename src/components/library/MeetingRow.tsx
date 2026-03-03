import { AudioLines, Download, Mic, Monitor, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';

import type { ExportFormat } from '../../lib/export';
import type { MeetingWithPreview } from '../../types';
import { formatDuration, formatShortDate, normalizeAudioSource, statusClasses } from './meetingUtils';

type MeetingRowProps = {
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
}: MeetingRowProps) {
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
    <article className="group rounded-md px-3 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(meeting.id)}
          className={[
            'h-4 w-4 rounded border-gray-300 accent-accent transition',
            selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
        />

        {isEditing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(event) => onEditTitleChange(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={onTitleKeyDown}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => onClick(meeting.id)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-700 transition hover:text-accent dark:text-gray-100"
          >
            {meeting.title}
          </button>
        )}

        {!isEditing ? (
          <button
            type="button"
            onClick={() => onStartRename(meeting.id, meeting.title)}
            className="opacity-0 transition group-hover:opacity-100 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label="Rename meeting"
          >
            <Pencil size={12} />
          </button>
        ) : null}

        <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline">{formatShortDate(meeting.started_at)}</span>
        <span className="hidden text-xs text-gray-500 dark:text-gray-400 md:inline">{formatDuration(meeting.duration_seconds)}</span>

        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses(meeting.status)}`}>
          {meeting.status}
        </span>

        <span className="text-gray-400 dark:text-gray-400">{sourceIcon(meeting.audio_sources)}</span>

        <span className="hidden max-w-[220px] truncate text-xs text-gray-500 dark:text-gray-400 lg:inline">
          {meeting.summary_preview?.trim() || 'No summary'}
        </span>

        <details className="relative">
          <summary className="list-none inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800">
            <Download size={11} />
            Export
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-[130px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <button type="button" onClick={(event) => onExportClick('md', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">Markdown</button>
            <button type="button" onClick={(event) => onExportClick('txt', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">Plain Text</button>
            <button type="button" onClick={(event) => onExportClick('json', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">JSON</button>
            <button type="button" onClick={(event) => onExportClick('pdf', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">PDF</button>
          </div>
        </details>

        {showTrash ? (
          <button
            type="button"
            onClick={() => onRestore(meeting.id)}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100/70 dark:border-emerald-500 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <Undo2 size={11} />
            Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSoftDelete(meeting.id)}
            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-100/70 dark:border-red-500 dark:text-red-200 dark:hover:bg-red-500/10"
          >
            <Trash2 size={11} />
            Delete
          </button>
        )}

        {meeting.status === 'recovered' && onRetranscribe && !showTrash ? (
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
