import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { SummaryTemplate } from '../lib/templates';

type TemplateCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, prompt: string) => Promise<void>;
  editingTemplate?: SummaryTemplate | null;
};

export function TemplateCreateModal({
  open,
  onClose,
  onSave,
  editingTemplate = null,
}: TemplateCreateModalProps) {
  const { t } = useTranslation('meeting');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(editingTemplate?.name ?? '');
    setDescription(editingTemplate?.description ?? '');
    setPrompt(editingTemplate?.prompt ?? '');
    setSaving(false);
  }, [editingTemplate, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, saving]);

  if (!open) {
    return null;
  }

  const canSave = name.trim().length > 0 && prompt.trim().length > 0 && !saving;

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t('template_cancel')}
        onClick={() => {
          if (!saving) {
            onClose();
          }
        }}
        className="fixed inset-0 z-[1001] bg-black/40 backdrop-blur-sm"
      />
      <div className="fixed left-1/2 top-1/2 z-[1002] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {editingTemplate ? t('template_editTitle') : t('template_createTitle')}
        </h3>

        <div className="mt-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('template_name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('template_description')}</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('template_prompt')}</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={10}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>

          <p className="text-xs text-gray-500 dark:text-gray-400">{t('template_promptHint')}</p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('template_cancel')}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!canSave) {
                return;
              }

              setSaving(true);
              try {
                await onSave(name.trim(), description.trim(), prompt.trim());
              } finally {
                setSaving(false);
              }
            }}
            disabled={!canSave}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('template_save')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
