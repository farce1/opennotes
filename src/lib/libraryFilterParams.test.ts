import { describe, expect, it } from 'vitest';

import type { LibraryFilters } from '../types';
import { buildMeetingFilterParams, durationBounds } from './libraryFilterParams';

const baseFilters: LibraryFilters = {
  search: '',
  status: '',
  durationRange: 'all',
  audioSource: '',
  dateFrom: '',
  dateTo: '',
};

function buildFilters(partial: Partial<LibraryFilters>): LibraryFilters {
  return { ...baseFilters, ...partial };
}

describe('durationBounds', () => {
  it('maps each duration preset', () => {
    expect(durationBounds('all')).toEqual({ min: 0, max: 0 });
    expect(durationBounds('short')).toEqual({ min: 0, max: 900 });
    expect(durationBounds('medium')).toEqual({ min: 900, max: 3600 });
    expect(durationBounds('long')).toEqual({ min: 3600, max: 0 });
  });
});

describe('buildMeetingFilterParams', () => {
  it('maps default filters to broad query params', () => {
    expect(buildMeetingFilterParams(baseFilters)).toEqual(['', 0, 0, '', '', '']);
  });

  it('passes status and audio filters as-is', () => {
    const filters = buildFilters({ status: 'completed', audioSource: 'mic' });
    expect(buildMeetingFilterParams(filters)).toEqual(['completed', 0, 0, 'mic', '', '']);
  });

  it('converts an inclusive dateTo into an exclusive next-day bound', () => {
    const filters = buildFilters({ dateFrom: '2026-03-04', dateTo: '2026-03-04' });
    expect(buildMeetingFilterParams(filters)).toEqual(['', 0, 0, '', '2026-03-04', '2026-03-05']);
  });

  it('handles month and leap-day boundaries correctly', () => {
    const endOfMonth = buildFilters({ dateTo: '2026-01-31' });
    const leapDay = buildFilters({ dateTo: '2024-02-29' });

    expect(buildMeetingFilterParams(endOfMonth)[5]).toBe('2026-02-01');
    expect(buildMeetingFilterParams(leapDay)[5]).toBe('2024-03-01');
  });
});
