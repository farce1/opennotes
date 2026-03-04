import { addDays, format, parseISO } from 'date-fns';
import type { LibraryFilters } from '../types';

export function durationBounds(range: LibraryFilters['durationRange']): { min: number; max: number } {
  if (range === 'short') {
    return { min: 0, max: 900 };
  }

  if (range === 'medium') {
    return { min: 900, max: 3600 };
  }

  if (range === 'long') {
    return { min: 3600, max: 0 };
  }

  return { min: 0, max: 0 };
}

function toExclusiveDateBound(dateInput: string): string {
  if (!dateInput) {
    return '';
  }

  const parsed = parseISO(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return format(addDays(parsed, 1), 'yyyy-MM-dd');
}

export function buildMeetingFilterParams(filters: LibraryFilters): [string, number, number, string, string, string] {
  const duration = durationBounds(filters.durationRange);

  return [
    filters.status,
    duration.min,
    duration.max,
    filters.audioSource,
    filters.dateFrom,
    toExclusiveDateBound(filters.dateTo),
  ];
}
