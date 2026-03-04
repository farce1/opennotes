import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { SummaryTemplate } from '../lib/templates';

type ManageTemplatesModalProps = {
  open: boolean;
  onClose: () => void;
  builtInTemplates: SummaryTemplate[];
  customTemplates: SummaryTemplate[];
  onEdit: (template: SummaryTemplate) => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (template: SummaryTemplate) => void;
};

export function ManageTemplatesModal({
  open,
  onClose,
  builtInTemplates,
  customTemplates,
  onEdit,
  onDelete,
  onDuplicate,
}: ManageTemplatesModalProps) {
  const { t } = useTranslation('meeting');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      setExpandedIds([]);
      setDeletingId(null);
    }
  }, [open]);

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('template_cancel')}
        onClick={onClose}
        className="fixed inset-0 z-[1001] bg-black/40 backdrop-blur-sm"
      />

      <div className="fixed left-1/2 top-1/2 z-[1002] max-h-[80vh] w-[min(92vw,900px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('template_manageTemplates')}</h3>
        </div>

        <div className="max-h-[calc(80vh-140px)] space-y-5 overflow-y-auto p-5">
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('template_builtIn')}</h4>
            <div className="space-y-2">
              {builtInTemplates.map((template) => {
                const isExpanded = expandedSet.has(template.id);
                return (
                  <article key={template.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h5 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{template.name}</h5>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{template.description}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedIds((previous) => (
                              previous.includes(template.id)
                                ? previous.filter((id) => id !== template.id)
                                : [...previous, template.id]
                            ));
                          }}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {isExpanded ? t('template_hidePrompt') : t('template_viewPrompt')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicate(template)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <Copy size={12} />
                          {t('template_duplicateAsCustom')}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-100/80 p-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-950 dark:text-gray-300">
                        {template.prompt}
                      </pre>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('template_myTemplates')}</h4>
            {customTemplates.length > 0 ? (
              <div className="space-y-2">
                {customTemplates.map((template) => (
                  <article key={template.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h5 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{template.name}</h5>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{template.description || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(template)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          <Pencil size={12} />
                          {t('template_edit')}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(t('template_confirmDelete'))) {
                              return;
                            }

                            setDeletingId(template.id);
                            try {
                              await onDelete(template.id);
                            } finally {
                              setDeletingId((current) => (current === template.id ? null : current));
                            }
                          }}
                          disabled={deletingId === template.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/70 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          <Trash2 size={12} />
                          {t('template_delete')}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t('template_noCustom')}
              </p>
            )}
          </section>
        </div>

        <div className="border-t border-gray-200 px-5 py-3 text-right dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('template_cancel')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
