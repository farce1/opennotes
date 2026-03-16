import { AudioLines, Mic, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SearchResult } from '../../types';
import { formatDate, formatDuration, normalizeAudioSource, statusClasses } from './meetingUtils';

type SearchResultRowProps = {
  result: SearchResult;
  selected: boolean;
  selectionMode: boolean;
  onOpen: (id: number) => void;
  onSelect: (id: number) => void;
  renderSnippet: (html: string) => { __html: string };
};

function sourceIcon(audioSource: string | null) {
  const source = normalizeAudioSource(audioSource);

  if (source === 'mic') return <Mic size={13} />;
  if (source === 'system') return <Monitor size={13} />;
  if (source === 'both') return <AudioLines size={13} />;
  return null;
}

export function SearchResultRow({
  result,
  selected,
  selectionMode,
  onOpen,
  onSelect,
  renderSnippet,
}: SearchResultRowProps) {
  const { t } = useTranslation('library');

  return (
    <article
      className={[
        'group rounded-xl p-4 transition-all duration-150',
        'hover:bg-white/60 dark:hover:bg-gray-800/40',
        selected ? 'bg-accent/5 ring-1 ring-accent/20 dark:bg-accent/8' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(result.id)}
          className={[
            'mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 accent-accent transition-opacity duration-150',
            selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
          aria-label={t('bulk_toggleSelection')}
        />

        <button
          type="button"
          onClick={() => onOpen(result.id)}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700 transition-colors duration-150 group-hover:text-accent dark:text-gray-100">
              {result.title}
            </h2>
            <span className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${statusClasses(result.status)}`}>
              {result.status}
            </span>
            <span className="text-gray-400 dark:text-gray-500">{sourceIcon(result.audio_sources)}</span>
          </div>

          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {formatDate(result.started_at)} &middot; {formatDuration(result.duration_seconds)}
          </p>
          <p
            className="mt-2 text-sm leading-relaxed text-gray-600 [&_mark]:rounded-md [&_mark]:bg-accent/10 [&_mark]:px-0.5 [&_mark]:text-accent dark:text-gray-300 dark:[&_mark]:bg-accent/20 dark:[&_mark]:text-accent-muted"
            dangerouslySetInnerHTML={renderSnippet(result.snippet)}
          />
        </button>
      </div>
    </article>
  );
}
