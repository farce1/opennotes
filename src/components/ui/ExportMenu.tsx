import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExportFormat } from '../../lib/export';

type ExportMenuProps = {
  onExport: (format: ExportFormat) => void;
  size?: 'sm' | 'md';
};

const formatKeys = [
  { value: 'md' as ExportFormat, labelKey: 'export_markdown' as const },
  { value: 'txt' as ExportFormat, labelKey: 'export_plainText' as const },
  { value: 'json' as ExportFormat, labelKey: 'export_json' as const },
  { value: 'pdf' as ExportFormat, labelKey: 'export_pdf' as const },
];

export function ExportMenu({ onExport, size = 'md' }: ExportMenuProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', onClickOutside);
    }

    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const iconSize = size === 'sm' ? 11 : 12;
  const btnClass = size === 'sm'
    ? 'gap-1 rounded-lg px-2 py-1 text-[11px]'
    : 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'inline-flex items-center font-medium transition-all duration-150 cursor-pointer',
          btnClass,
          'border border-gray-200/60 bg-white/50 text-gray-600 shadow-sm',
          'hover:bg-white/80 hover:border-gray-300/70 hover:text-gray-700',
          'dark:border-gray-700/60 dark:bg-gray-800/50 dark:text-gray-300',
          'dark:hover:bg-gray-800/80 dark:hover:border-gray-600/70 dark:hover:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-accent/40',
        ].join(' ')}
      >
        <Download size={iconSize} />
        {t('btn_export')}
      </button>

      {open && (
        <div
          className={[
            'absolute right-0 z-30 mt-1.5 min-w-[140px] overflow-hidden rounded-xl',
            'border border-gray-200/70 bg-white/95 shadow-lg shadow-black/8 backdrop-blur-xl',
            'dark:border-gray-700/70 dark:bg-gray-900/95 dark:shadow-black/30',
            'animate-[dropdownIn_120ms_ease-out]',
          ].join(' ')}
        >
          <div className="p-1">
            {formatKeys.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  onExport(f.value);
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs text-gray-600 transition-colors duration-100 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-gray-800/80"
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
