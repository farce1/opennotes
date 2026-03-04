import { Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';

type SummaryPanelProps = {
  summaryText: string;
  generating: boolean;
  edited: boolean;
  hasExistingSummary: boolean;
  generatedWithModel?: string | null;
  generatedWithTemplate?: string | null;
  templatePicker?: ReactNode;
  onTextChange: (text: string) => void;
  onRegenerate: () => void;
  onSave: (text: string) => Promise<void> | void;
  meetingId: number;
};

export function SummaryPanel({
  summaryText,
  generating,
  edited,
  hasExistingSummary,
  generatedWithModel,
  generatedWithTemplate,
  templatePicker,
  onTextChange,
  onRegenerate,
  onSave,
  meetingId,
}: SummaryPanelProps) {
  const { t } = useTranslation('meeting');
  const { t: tc } = useTranslation('common');
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(summaryText);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(summaryText);
    }
  }, [isEditing, summaryText]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  const queueSave = (text: string) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await onSave(text);
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1200);
      } catch {
        setSaveState('error');
      }
    }, 2000);
  };

  const onRegenerateClick = () => {
    onRegenerate();
    setIsEditing(false);
  };

  const onDraftChange = (text: string) => {
    setDraftText(text);
    onTextChange(text);
    setSaveState('idle');
    queueSave(text);
  };

  return (
    <section className="p-4 text-gray-900 dark:text-gray-50">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-100">{t('summary_title')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('summary_meetingId', { id: meetingId })}</p>
          {generatedWithTemplate ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('summary_generatedWithTemplate', { name: generatedWithTemplate })}
              {generatedWithModel ? ` (${generatedWithModel})` : ''}
            </p>
          ) : generatedWithModel ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('summary_generatedWith', { model: generatedWithModel })}</p>
          ) : null}
        </div>

        <div className="flex min-w-[240px] flex-col gap-2">
          {templatePicker ?? null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!generating ? (
              <button
                type="button"
                onClick={() => setIsEditing((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Pencil size={12} />
                {isEditing ? t('summary_doneEditing') : tc('btn_edit')}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onRegenerateClick}
              disabled={generating}
              className={[
                'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition',
                edited
                  ? 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700/60 dark:text-amber-300 dark:hover:bg-amber-900/30'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
                'disabled:cursor-not-allowed disabled:opacity-60',
              ].join(' ')}
            >
              <RefreshCw size={12} />
              {hasExistingSummary ? t('summary_regenerate') : t('summary_generate')}
            </button>
          </div>
        </div>
      </header>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draftText}
            onChange={(event) => onDraftChange(event.target.value)}
            className="h-[26rem] w-full resize-y rounded-lg border border-gray-200 bg-gray-50/60 p-3 font-mono text-sm leading-relaxed text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {saveState === 'saving' ? t('summary_saving') : null}
            {saveState === 'saved' ? t('summary_saved') : null}
            {saveState === 'error' ? t('summary_autoSaveFailed') : null}
            {saveState === 'idle' ? t('summary_autoSaveHint') : null}
          </div>
        </div>
      ) : (
        <div className="relative min-h-[26rem] rounded-lg bg-gray-50/50 p-4 dark:bg-gray-800/50">
          {summaryText ? (
            <div className="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-100">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-700 first:mt-0 dark:text-gray-100">{children}</h2>
                  ),
                  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
                  li: ({ children }) => <li className="text-sm text-gray-700 dark:text-gray-100">{children}</li>,
                  p: ({ children }) => (
                    <p className="mb-3 text-sm leading-relaxed text-gray-700 dark:text-gray-100">{children}</p>
                  ),
                  input: ({ node: _node, ...props }) => (
                    <input
                      {...props}
                      disabled
                      className="mr-2 inline-block h-3.5 w-3.5 rounded border border-gray-300 accent-accent"
                    />
                  ),
                }}
              >
                {summaryText}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('summary_placeholder')}</p>
          )}

          {generating ? <span className="absolute bottom-3 right-3 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> : null}
        </div>
      )}
    </section>
  );
}
