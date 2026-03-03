import { Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SummaryPanelProps = {
  summaryText: string;
  generating: boolean;
  edited: boolean;
  hasExistingSummary: boolean;
  generatedWithModel?: string | null;
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
  onTextChange,
  onRegenerate,
  onSave,
  meetingId,
}: SummaryPanelProps) {
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
    if (edited || hasExistingSummary) {
      const approved = window.confirm('Re-generating will replace your current notes. Continue?');
      if (!approved) {
        return;
      }
    }

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
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-100">Meeting Summary</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Meeting #{meetingId}</p>
          {generatedWithModel ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Generated with {generatedWithModel}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!generating ? (
            <button
              type="button"
              onClick={() => setIsEditing((value) => !value)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Pencil size={12} />
              {isEditing ? 'Done Editing' : 'Edit'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onRegenerateClick}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={12} />
            Re-generate
          </button>
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
            {saveState === 'saving' ? 'Saving…' : null}
            {saveState === 'saved' ? 'Saved' : null}
            {saveState === 'error' ? 'Auto-save failed. Continue editing and retry.' : null}
            {saveState === 'idle' ? 'Auto-save after 2 seconds of inactivity.' : null}
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
            <p className="text-sm text-gray-500 dark:text-gray-400">Summary will appear here when generated.</p>
          )}

          {generating ? <span className="absolute bottom-3 right-3 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> : null}
        </div>
      )}
    </section>
  );
}
