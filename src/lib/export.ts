import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

import { getDb } from './db';
import type { Meeting, TranscriptRow } from '../types';

export type ExportFormat = 'md' | 'txt' | 'json' | 'pdf';

type MeetingExportData = {
  meeting: Meeting;
  summary: string | null;
  transcript: Array<{ text: string; start_time_ms: number }>;
};

function safeFileName(title: string): string {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'meeting';
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDuration(durationSeconds: number | null): string {
  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
    return 'In progress';
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

async function loadMeetingExportData(meetingId: number): Promise<MeetingExportData> {
  const db = await getDb();

  const meetingRows = await db.select<Meeting[]>(
    `SELECT
       id,
       title,
       started_at,
       ended_at,
       duration_seconds,
       status,
       audio_path,
       audio_sources,
       created_at,
       updated_at,
       deleted_at
     FROM meetings
     WHERE id = $1
     LIMIT 1`,
    [meetingId],
  );

  const meeting = meetingRows[0];
  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  const summaryRows = await db.select<Array<{ content: string }>>(
    `SELECT content
     FROM summaries
     WHERE meeting_id = $1
     ORDER BY generated_at DESC
     LIMIT 1`,
    [meetingId],
  );

  const transcriptRows = await db.select<TranscriptRow[]>(
    `SELECT segment_index, text, start_time_ms
     FROM transcripts
     WHERE meeting_id = $1
     ORDER BY segment_index`,
    [meetingId],
  );

  return {
    meeting,
    summary: summaryRows[0]?.content ?? null,
    transcript: transcriptRows.map((row) => ({
      text: row.text,
      start_time_ms: row.start_time_ms,
    })),
  };
}

function buildMarkdown(data: MeetingExportData): string {
  const { meeting, summary, transcript } = data;
  const transcriptLines = transcript.map((segment) => `[${formatTimestamp(segment.start_time_ms)}] ${segment.text}`).join('\n');

  return [
    `# ${meeting.title}`,
    '',
    `**Date:** ${new Date(meeting.started_at).toLocaleString()}`,
    `**Duration:** ${formatDuration(meeting.duration_seconds)}`,
    `**Status:** ${meeting.status}`,
    '',
    '## Summary',
    '',
    summary?.trim() || 'No summary available',
    '',
    '## Transcript',
    '',
    transcriptLines || 'No transcript available',
    '',
  ].join('\n');
}

function buildPlainText(data: MeetingExportData): string {
  const { meeting, summary, transcript } = data;
  const transcriptLines = transcript.map((segment) => `[${formatTimestamp(segment.start_time_ms)}] ${segment.text}`).join('\n');

  return [
    meeting.title,
    '',
    `Date: ${new Date(meeting.started_at).toLocaleString()}`,
    `Duration: ${formatDuration(meeting.duration_seconds)}`,
    `Status: ${meeting.status}`,
    '',
    'Summary',
    '-------',
    summary?.trim() || 'No summary available',
    '',
    'Transcript',
    '----------',
    transcriptLines || 'No transcript available',
    '',
  ].join('\n');
}

function buildJson(data: MeetingExportData): string {
  const { meeting, summary, transcript } = data;

  return JSON.stringify(
    {
      title: meeting.title,
      date: meeting.started_at,
      duration_seconds: meeting.duration_seconds,
      status: meeting.status,
      summary,
      transcript: transcript.map((segment) => ({
        timestamp_ms: segment.start_time_ms,
        text: segment.text,
      })),
    },
    null,
    2,
  );
}

async function buildPdfBlob(data: MeetingExportData): Promise<Blob> {
  const { buildPdfBlob: renderPdf } = await import('./pdf-renderer');
  const summarySource =
    data.summary?.trim() ||
    data.transcript.map((segment) => `[${formatTimestamp(segment.start_time_ms)}] ${segment.text}`).join('\n') ||
    'No summary or transcript available';
  return renderPdf(data.meeting.title, summarySource);
}

async function saveBytes(defaultPath: string, filterName: string, extension: string, data: Uint8Array): Promise<void> {
  const destination = await save({
    defaultPath,
    filters: [{ name: filterName, extensions: [extension] }],
  });

  if (!destination) {
    return;
  }

  await writeFile(destination, data);
}

export async function exportMeetingMarkdown(meetingId: number): Promise<void> {
  const data = await loadMeetingExportData(meetingId);
  const content = buildMarkdown(data);
  await saveBytes(`${safeFileName(data.meeting.title)}.md`, 'Markdown', 'md', new TextEncoder().encode(content));
}

export async function exportMeetingText(meetingId: number): Promise<void> {
  const data = await loadMeetingExportData(meetingId);
  const content = buildPlainText(data);
  await saveBytes(`${safeFileName(data.meeting.title)}.txt`, 'Text', 'txt', new TextEncoder().encode(content));
}

export async function exportMeetingJson(meetingId: number): Promise<void> {
  const data = await loadMeetingExportData(meetingId);
  const content = buildJson(data);
  await saveBytes(`${safeFileName(data.meeting.title)}.json`, 'JSON', 'json', new TextEncoder().encode(content));
}

export async function exportMeetingPdf(meetingId: number): Promise<void> {
  const data = await loadMeetingExportData(meetingId);
  const blob = await buildPdfBlob(data);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await saveBytes(`${safeFileName(data.meeting.title)}.pdf`, 'PDF', 'pdf', bytes);
}

export async function exportMeeting(meetingId: number, format: ExportFormat): Promise<void> {
  if (format === 'md') {
    await exportMeetingMarkdown(meetingId);
    return;
  }

  if (format === 'txt') {
    await exportMeetingText(meetingId);
    return;
  }

  if (format === 'json') {
    await exportMeetingJson(meetingId);
    return;
  }

  await exportMeetingPdf(meetingId);
}

export async function bulkExportZip(meetingIds: number[], format: ExportFormat): Promise<void> {
  if (meetingIds.length === 0) {
    return;
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const meetingId of meetingIds) {
    const data = await loadMeetingExportData(meetingId);
    const fileName = safeFileName(data.meeting.title);

    if (format === 'pdf') {
      const blob = await buildPdfBlob(data);
      zip.file(`${fileName}.pdf`, await blob.arrayBuffer());
      continue;
    }

    if (format === 'md') {
      zip.file(`${fileName}.md`, buildMarkdown(data));
      continue;
    }

    if (format === 'txt') {
      zip.file(`${fileName}.txt`, buildPlainText(data));
      continue;
    }

    zip.file(`${fileName}.json`, buildJson(data));
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });

  const destination = await save({
    defaultPath: `opennotes-export-${format}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (!destination) {
    return;
  }

  await writeFile(destination, new Uint8Array(await zipBlob.arrayBuffer()));
}
