import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingWithPreview, SearchResult } from '../types';
import { getVisibleLibraryIds, groupByDateSection, pruneSelectedIds } from './useLibrary';

function buildMeeting(id: number, startedAt = '2026-03-16T10:00:00.000Z'): MeetingWithPreview {
  return {
    id,
    title: `Meeting ${id}`,
    started_at: startedAt,
    ended_at: null,
    duration_seconds: 120,
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
    summary_preview: 'Preview',
    segment_count: 3,
  };
}

function buildSearchResult(id: number): SearchResult {
  return {
    id,
    title: `Result ${id}`,
    started_at: '2026-03-16T10:00:00.000Z',
    status: 'completed',
    duration_seconds: 120,
    audio_sources: 'system',
    snippet: 'match',
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

describe('getVisibleLibraryIds', () => {
  it('returns meeting ids when search is inactive', () => {
    expect(getVisibleLibraryIds([buildMeeting(1), buildMeeting(2)], null)).toEqual([1, 2]);
  });

  it('prefers search result ids when search is active', () => {
    expect(getVisibleLibraryIds([buildMeeting(1), buildMeeting(2)], [buildSearchResult(5), buildSearchResult(8)])).toEqual([5, 8]);
  });
});

describe('pruneSelectedIds', () => {
  it('removes ids that are no longer visible', () => {
    expect(Array.from(pruneSelectedIds(new Set([1, 2, 3]), [2, 3, 4]))).toEqual([2, 3]);
  });

  it('returns the original set instance when nothing changes', () => {
    const selected = new Set([1, 2]);

    expect(pruneSelectedIds(selected, [1, 2, 3])).toBe(selected);
  });
});
