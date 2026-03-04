import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { createElement } from 'react';

type SummarySection = {
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

export function parseSections(markdown: string): SummarySection[] {
  const lines = markdown.split('\n');
  const sections: SummarySection[] = [];
  let activeHeading = 'Overview';
  let activeLines: string[] = [];

  const pushSection = () => {
    const content = stripMarkdown(activeLines.join('\n'));
    if (content) {
      sections.push({ heading: activeHeading, content });
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

  if (sections.length > 0) {
    return sections;
  }

  return [
    {
      heading: 'Summary',
      content: stripMarkdown(markdown),
    },
  ];
}

function SummaryDocument({ title, sections }: { title: string; sections: SummarySection[] }) {
  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'A4', style: pdfStyles.page },
      createElement(Text, { style: pdfStyles.title }, title),
      ...sections.map((section, index) =>
        createElement(
          View,
          { key: `${section.heading}-${index}`, style: pdfStyles.section },
          createElement(Text, { style: pdfStyles.heading }, section.heading),
          createElement(Text, { style: pdfStyles.body }, section.content),
        ),
      ),
    ),
  );
}

export async function buildPdfBlob(title: string, summaryMarkdown: string): Promise<Blob> {
  const sections = parseSections(summaryMarkdown);
  return pdf(createElement(SummaryDocument, { title, sections })).toBlob();
}
