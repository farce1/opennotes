import { Download, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';

import type { ExportFormat } from '../../lib/export';

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
  const onExportClick = (format: ExportFormat, event: MouseEvent<HTMLButtonElement>) => {
    onBulkExport(format);
    const details = event.currentTarget.closest('details');
    if (details) {
      details.removeAttribute('open');
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(920px,calc(100vw-5rem))] -translate-x-1/2 animate-[transcriptFade_160ms_ease-out] rounded-2xl border border-gray-200 bg-gray-100/95 px-4 py-3 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-100">
          <span className="font-semibold">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Deselect
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBulkDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-100/80 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-200/90 dark:border-red-500 dark:bg-red-500/20 dark:text-red-200"
          >
            <Trash2 size={12} />
            Delete
          </button>

          <details className="relative">
            <summary className="list-none inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-700/80 dark:text-gray-100 dark:hover:bg-gray-700">
              <Download size={12} />
              Export
            </summary>
            <div className="absolute right-0 z-20 mt-1 min-w-[150px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <button type="button" onClick={(event) => onExportClick('md', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">Markdown</button>
              <button type="button" onClick={(event) => onExportClick('txt', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">Plain Text</button>
              <button type="button" onClick={(event) => onExportClick('json', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">JSON</button>
              <button type="button" onClick={(event) => onExportClick('pdf', event)} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">PDF</button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
