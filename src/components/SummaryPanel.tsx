import { Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SummaryPanelProps = {
  summaryText: string;
  generating: boolean;
  edited: boolean;
  hasExistingSummary: boolean;
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
    <section className="rounded-xl border border-warm-200/80 bg-white/80 p-4 dark:border-warm-700 dark:bg-warm-900/30">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-warm-700 dark:text-warm-100">Meeting Summary</h2>
          <p className="text-xs text-warm-500 dark:text-warm-300">Meeting #{meetingId}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!generating ? (
            <button
              type="button"
              onClick={() => setIsEditing((value) => !value)}
              className="inline-flex items-center gap-1 rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-semibold text-warm-700 transition hover:bg-warm-100 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
            >
              <Pencil size={12} />
              {isEditing ? 'Done Editing' : 'Edit'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onRegenerateClick}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
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
            className="h-[26rem] w-full resize-y rounded-lg border border-warm-200 bg-warm-50/60 p-3 font-mono text-sm leading-relaxed text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-700 dark:bg-warm-900/60 dark:text-warm-100"
          />
          <div className="text-xs text-warm-500 dark:text-warm-300">
            {saveState === 'saving' ? 'Saving…' : null}
            {saveState === 'saved' ? 'Saved' : null}
            {saveState === 'error' ? 'Auto-save failed. Continue editing and retry.' : null}
            {saveState === 'idle' ? 'Auto-save after 2 seconds of inactivity.' : null}
          </div>
        </div>
      ) : (
        <div className="relative min-h-[26rem] rounded-lg border border-warm-200/80 bg-warm-50/50 p-4 dark:border-warm-700 dark:bg-warm-900/40">
          {summaryText ? (
            <div className="prose prose-sm max-w-none text-warm-700 dark:prose-invert dark:text-warm-100">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2 className="mb-2 mt-6 text-lg font-semibold text-warm-700 first:mt-0 dark:text-warm-100">{children}</h2>
                  ),
                  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
                  li: ({ children }) => <li className="text-sm text-warm-700 dark:text-warm-100">{children}</li>,
                  p: ({ children }) => (
                    <p className="mb-3 text-sm leading-relaxed text-warm-700 dark:text-warm-100">{children}</p>
                  ),
                  input: ({ node: _node, ...props }) => (
                    <input
                      {...props}
                      disabled
                      className="mr-2 inline-block h-3.5 w-3.5 rounded border border-warm-300 accent-accent"
                    />
                  ),
                }}
              >
                {summaryText}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-warm-500 dark:text-warm-300">Summary will appear here when generated.</p>
          )}

          {generating ? <span className="absolute bottom-3 right-3 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> : null}
        </div>
      )}
    </section>
  );
}
