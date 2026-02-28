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
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(920px,calc(100vw-5rem))] -translate-x-1/2 animate-[transcriptFade_160ms_ease-out] rounded-2xl border border-warm-300/80 bg-warm-100/95 px-4 py-3 shadow-lg backdrop-blur dark:border-warm-600 dark:bg-warm-800/95">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-warm-700 dark:text-warm-100">
          <span className="font-semibold">{selectedCount} selected</span>
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full border border-warm-300 px-2.5 py-1 text-xs font-medium hover:bg-warm-200 dark:border-warm-500 dark:hover:bg-warm-700"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="rounded-full border border-warm-300 px-2.5 py-1 text-xs font-medium hover:bg-warm-200 dark:border-warm-500 dark:hover:bg-warm-700"
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
            <summary className="list-none inline-flex cursor-pointer items-center gap-1 rounded-lg border border-warm-300 bg-white/70 px-3 py-1.5 text-xs font-semibold text-warm-700 transition hover:bg-warm-200 dark:border-warm-500 dark:bg-warm-700/80 dark:text-warm-100 dark:hover:bg-warm-700">
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
        </div>
      </div>
    </div>
  );
}
