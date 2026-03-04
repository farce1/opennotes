import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ExportFormat } from '../../lib/export';
import { ExportMenu } from '../ui/ExportMenu';

type BulkActionBarProps = {
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkDelete: () => void;
  onBulkExport: (format: ExportFormat) => void;
};

export function BulkActionBar({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBulkDelete,
  onBulkExport,
}: BulkActionBarProps) {
  const { t } = useTranslation('library');
  const { t: tc } = useTranslation('common');

  return (
    <div
      className={[
        'fixed bottom-4 left-1/2 z-50 w-[min(920px,calc(100vw-5rem))] -translate-x-1/2',
        'animate-[transcriptFade_160ms_ease-out] rounded-2xl',
        'border border-gray-200/50 bg-white/90 px-5 py-3 shadow-xl shadow-black/8 backdrop-blur-xl',
        'dark:border-gray-700/50 dark:bg-gray-900/90 dark:shadow-black/30',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-100">
          <span className="font-semibold">{t('bulk_selected', { count: selectedCount })}</span>
          <button
            type="button"
            onClick={onSelectAll}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 transition-all duration-150 hover:bg-gray-100/80 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-200"
          >
            {t('bulk_selectAll')}
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 transition-all duration-150 hover:bg-gray-100/80 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-200"
          >
            {t('bulk_deselect')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBulkDelete}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 transition-all duration-150 hover:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            <Trash2 size={12} />
            {tc('btn_delete')}
          </button>

          <ExportMenu onExport={onBulkExport} />
        </div>
      </div>
    </div>
  );
}
