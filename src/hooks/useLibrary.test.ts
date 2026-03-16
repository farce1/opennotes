import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingWithPreview } from '../types';
import { groupByDateSection } from './useLibrary';

function buildMeeting(id: number, startedAt: string): MeetingWithPreview {
  return {
    id,
    title: `Meeting ${id}`,
    started_at: startedAt,
    ended_at: null,
    duration_seconds: null,
    status: 'completed',
    post_processing_status: 'complete',
    audio_path: null,
    audio_sources: 'both',
    created_at: startedAt,
    updated_at: startedAt,
    deleted_at: null,
    detected_language: null,
    asr_engine: null,
    diarization_status: 'complete',
    summary_preview: null,
    segment_count: 0,
  };
}

describe('groupByDateSection', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-03-05T12:00:00'));
  });

  it('localizes relative and month-year section labels', () => {
    const sections = groupByDateSection(
      [
        buildMeeting(1, '2026-03-05T09:00:00'),
        buildMeeting(2, '2026-03-04T09:00:00'),
        buildMeeting(3, '2026-03-02T09:00:00'),
        buildMeeting(4, '2026-03-01T09:00:00'),
        buildMeeting(5, '2026-02-20T09:00:00'),
      ],
      'pl',
      {
        today: 'Dzisiaj',
        yesterday: 'Wczoraj',
        thisWeek: 'Ten tydzień',
      },
    );

    expect(sections.map((section) => section.label)).toEqual([
      'Dzisiaj',
      'Wczoraj',
      'Ten tydzień',
      'marzec 2026',
      'luty 2026',
    ]);
  });
});
