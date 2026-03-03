import { Copy, Download, FileText } from 'lucide-react';
import { useState } from 'react';

type SummaryExportProps = {
  summaryText: string;
  meetingTitle: string;
};

function safeFileName(title: string): string {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'meeting-summary';
}

export function SummaryExport({ summaryText, meetingTitle }: SummaryExportProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const disabled = summaryText.trim().length === 0;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  };

  const onExportMarkdown = () => {
    const blob = new Blob([summaryText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(meetingTitle)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onExportPdf = async () => {
    setCreatingPdf(true);
    try {
      const { buildPdfBlob } = await import('../lib/pdf-renderer');
      const blob = await buildPdfBlob(meetingTitle, summaryText);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeFileName(meetingTitle)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError(true);
      window.setTimeout(() => setPdfError(false), 2000);
    } finally {
      setCreatingPdf(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
      >
        <Copy size={13} />
        {copyState === 'copied' ? 'Copied!' : 'Copy'}
      </button>

      <button
        type="button"
        onClick={onExportMarkdown}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
      >
        <Download size={13} />
        Export Markdown
      </button>

      <button
        type="button"
        onClick={() => void onExportPdf()}
        disabled={disabled || creatingPdf}
        className="inline-flex items-center gap-2 rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-semibold text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warm-600 dark:text-warm-100 dark:hover:bg-warm-800"
      >
        <FileText size={13} />
        {pdfError ? 'Export failed' : creatingPdf ? 'Generating PDF…' : 'Export PDF'}
      </button>

      {copyState === 'error' ? <span className="text-xs text-red-600 dark:text-red-300">Clipboard access failed.</span> : null}
    </div>
  );
}
