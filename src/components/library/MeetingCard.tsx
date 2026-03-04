import { AudioLines, Mic, Monitor, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { MeetingWithPreview } from '../../types';
import type { ExportFormat } from '../../lib/export';
import { ExportMenu } from '../ui/ExportMenu';
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

function SourceBadge({ meeting }: { meeting: MeetingWithPreview }) {
  const { t } = useTranslation('common');
  const source = normalizeAudioSource(meeting.audio_sources);
  const base =
    'inline-flex items-center gap-1 rounded-lg bg-gray-100/60 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800/40 dark:text-gray-400';

  if (source === 'mic') {
    return (
      <span className={base}>
        <Mic size={11} /> {t('source_mic')}
      </span>
    );
  }

  if (source === 'system') {
    return (
      <span className={base}>
        <Monitor size={11} /> {t('source_system')}
      </span>
    );
  }

  if (source === 'both') {
    return (
      <span className={base}>
        <AudioLines size={11} /> {t('source_both')}
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
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');
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

  return (
    <article
      className={[
        'group rounded-xl p-4 transition-all duration-150',
        'hover:bg-white/60 dark:hover:bg-gray-800/40',
        selected ? 'bg-accent/5 ring-1 ring-accent/20 dark:bg-accent/8' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(meeting.id)}
            className={[
              'mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 accent-accent transition-opacity duration-150',
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
                  className="w-full rounded-lg border border-accent/30 bg-white/80 px-2 py-1 text-base font-semibold text-gray-700 outline-none ring-2 ring-accent/20 transition dark:border-accent/30 dark:bg-gray-900 dark:text-gray-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onClick(meeting.id)}
                  className="text-left text-base font-semibold text-gray-700 transition-colors duration-150 hover:text-accent cursor-pointer dark:text-gray-100"
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
                  <Pencil size={13} />
                </button>
              )}
            </div>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {formatDate(meeting.started_at)} &middot; {formatDuration(meeting.duration_seconds)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${statusClasses(meeting.status)}`}>
            {meeting.status}
          </span>
          <SourceBadge meeting={meeting} />
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        {meeting.summary_preview?.trim() || t('card_noSummary')}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{t('card_segments', { count: meeting.segment_count })}</span>
        <span>&middot;</span>
        <span>{t('card_previewWords', { count: words })}</span>

        <div className="ml-auto flex items-center gap-1.5">
          <ExportMenu onExport={(format) => onExport(meeting.id, format)} />

          {showTrash ? (
            <button
              type="button"
              onClick={() => onRestore(meeting.id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-all duration-150 hover:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              <Undo2 size={12} />
              {tc('btn_restore')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSoftDelete(meeting.id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 transition-all duration-150 hover:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <Trash2 size={12} />
              {tc('btn_delete')}
            </button>
          )}

          {meeting.status === 'recovered' && onRetranscribe && !showTrash && (
            <button
              type="button"
              onClick={() => onRetranscribe(meeting.id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-all duration-150 hover:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              <RotateCcw size={12} />
              {t('card_reTranscribe')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
