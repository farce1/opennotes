import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { Copy, Download, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';

type SummaryExportProps = {
  summaryText: string;
  meetingTitle: string;
};

type ParsedSection = {
  heading: string;
  content: string;
};

const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1e293b',
  },
  title: {
    fontSize: 16,
    marginBottom: 12,
    fontFamily: 'Helvetica-Bold',
  },
  section: {
    marginBottom: 10,
  },
  heading: {
    fontSize: 12,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  body: {
    lineHeight: 1.4,
  },
});

function safeFileName(title: string): string {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'meeting-summary';
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^TITLE:\s*/gim, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .trim();
}

function parseSections(markdown: string): ParsedSection[] {
  const lines = markdown.split('\n');
  const sections: ParsedSection[] = [];
  let activeHeading = 'Overview';
  let activeLines: string[] = [];

  const pushSection = () => {
    const content = stripMarkdown(activeLines.join('\n'));
    if (content) {
      sections.push({
        heading: activeHeading,
        content,
      });
    }
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      pushSection();
      activeHeading = line.replace(/^##\s+/, '').trim() || 'Section';
      activeLines = [];
    } else {
      activeLines.push(line);
    }
  }

  pushSection();

  return sections.length
    ? sections
    : [
        {
          heading: 'Summary',
          content: stripMarkdown(markdown),
        },
      ];
}

function SummaryDocument({ title, sections }: { title: string; sections: ParsedSection[] }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>{title}</Text>
        {sections.map((section, index) => (
          <View key={`${section.heading}-${index}`} style={pdfStyles.section}>
            <Text style={pdfStyles.heading}>{section.heading}</Text>
            <Text style={pdfStyles.body}>{section.content}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function SummaryExport({ summaryText, meetingTitle }: SummaryExportProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [creatingPdf, setCreatingPdf] = useState(false);

  const disabled = summaryText.trim().length === 0;
  const sections = useMemo(() => parseSections(summaryText), [summaryText]);

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
    try {
      setCreatingPdf(true);
      const blob = await pdf(<SummaryDocument title={meetingTitle} sections={sections} />).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeFileName(meetingTitle)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
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
        {creatingPdf ? 'Generating PDF…' : 'Export PDF'}
      </button>

      {copyState === 'error' ? <span className="text-xs text-red-600 dark:text-red-300">Clipboard access failed.</span> : null}
    </div>
  );
}
