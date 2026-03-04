import { AudioLines, Mic, Monitor, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExportFormat } from '../../lib/export';
import type { MeetingWithPreview } from '../../types';
import { ExportMenu } from '../ui/ExportMenu';
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

  if (source === 'mic') return <Mic size={13} />;
  if (source === 'system') return <Monitor size={13} />;
  if (source === 'both') return <AudioLines size={13} />;
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
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');
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

  return (
    <article
      className={[
        'group rounded-lg px-3 py-2 transition-all duration-150',
        'hover:bg-white/60 dark:hover:bg-gray-800/40',
        selected ? 'bg-accent/5 ring-1 ring-accent/20 dark:bg-accent/8' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(meeting.id)}
          className={[
            'h-4 w-4 cursor-pointer rounded border-gray-300 accent-accent transition-opacity duration-150',
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
            className="min-w-0 flex-1 rounded-lg border border-accent/30 bg-white/80 px-2 py-1 text-sm font-semibold text-gray-700 outline-none ring-2 ring-accent/20 transition dark:border-accent/30 dark:bg-gray-900 dark:text-gray-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => onClick(meeting.id)}
            className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-semibold text-gray-700 transition-colors duration-150 hover:text-accent dark:text-gray-100"
          >
            {meeting.title}
          </button>
        )}

        {!isEditing && (
          <button
            type="button"
            onClick={() => onStartRename(meeting.id, meeting.title)}
            className="cursor-pointer rounded-md p-1 text-gray-400 opacity-0 transition-all duration-150 hover:bg-gray-100/80 hover:text-gray-700 group-hover:opacity-100 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label={t('card_renameLabel')}
          >
            <Pencil size={12} />
          </button>
        )}

        <span className="hidden text-xs text-gray-400 dark:text-gray-500 sm:inline">{formatShortDate(meeting.started_at)}</span>
        <span className="hidden text-xs text-gray-400 dark:text-gray-500 md:inline">{formatDuration(meeting.duration_seconds)}</span>

        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${statusClasses(meeting.status)}`}>
          {meeting.status}
        </span>

        <span className="text-gray-400 dark:text-gray-500">{sourceIcon(meeting.audio_sources)}</span>

        <span className="hidden max-w-[220px] truncate text-xs text-gray-400 dark:text-gray-500 lg:inline">
          {meeting.summary_preview?.trim() || t('card_noSummaryShort')}
        </span>

        <ExportMenu onExport={(format) => onExport(meeting.id, format)} size="sm" />

        {showTrash ? (
          <button
            type="button"
            onClick={() => onRestore(meeting.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-600 transition-all duration-150 hover:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
          >
            <Undo2 size={11} />
            {tc('btn_restore')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSoftDelete(meeting.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-500 transition-all duration-150 hover:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            <Trash2 size={11} />
            {tc('btn_delete')}
          </button>
        )}

        {meeting.status === 'recovered' && onRetranscribe && !showTrash && (
          <button
            type="button"
            onClick={() => onRetranscribe(meeting.id)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-amber-600 transition-all duration-150 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <RotateCcw size={11} />
            {t('card_re')}
          </button>
        )}
      </div>
    </article>
  );
}
