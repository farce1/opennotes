import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isToday, isYesterday, startOfWeek } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getDb } from '../lib/db';
import { buildMeetingFilterParams } from '../lib/libraryFilterParams';
import type {
  DateSection,
  LibraryFilters,
  MeetingWithPreview,
  SearchResult,
  SortDirection,
  SortField,
  ViewMode,
} from '../types';

const DEFAULT_FILTERS: LibraryFilters = {
  search: '',
  status: '',
  durationRange: 'all',
  audioSource: '',
  dateFrom: '',
  dateTo: '',
};

export function getVisibleLibraryIds(meetings: MeetingWithPreview[], searchResults: SearchResult[] | null): number[] {
  return (searchResults ?? meetings).map((item) => item.id);
}

export function pruneSelectedIds(selectedIds: Set<number>, visibleIds: number[]): Set<number> {
  const visibleIdSet = new Set(visibleIds);
  const next = new Set(Array.from(selectedIds).filter((id) => visibleIdSet.has(id)));

  if (next.size === selectedIds.size) {
    return selectedIds;
  }

  return next;
}

export function sanitizeFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, '')}"`)
    .join(' ');
}

function toSortClause(sortField: SortField, sortDirection: SortDirection): string {
  const direction = sortDirection === 'asc' ? 'ASC' : 'DESC';

  if (sortField === 'duration') {
    return `COALESCE(m.duration_seconds, 0) ${direction}, m.started_at DESC`;
  }

  if (sortField === 'title') {
    return `LOWER(m.title) ${direction}, m.started_at DESC`;
  }

  return `m.started_at ${direction}`;
}

type DateSectionLabels = {
  today: string;
  yesterday: string;
  thisWeek: string;
};

export function groupByDateSection(
  meetings: MeetingWithPreview[],
  locale: string,
  labels: DateSectionLabels,
): DateSection[] {
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const sections = new Map<string, MeetingWithPreview[]>();
  const monthYearFormatter = new Intl.DateTimeFormat(locale || 'en', {
    month: 'long',
    year: 'numeric',
  });

  for (const meeting of meetings) {
    const startedAt = new Date(meeting.started_at);
    let label = monthYearFormatter.format(startedAt);

    if (isToday(startedAt)) {
      label = labels.today;
    } else if (isYesterday(startedAt)) {
      label = labels.yesterday;
    } else if (startedAt >= thisWeekStart) {
      label = labels.thisWeek;
    }

    const existing = sections.get(label) ?? [];
    existing.push(meeting);
    sections.set(label, existing);
  }

  return Array.from(sections.entries()).map(([label, items]) => ({ label, items }));
}

type UseLibraryOptions = {
  initialShowTrash?: boolean;
  lockScope?: boolean;
};

export function useLibrary(options: UseLibraryOptions = {}) {
  const { t, i18n } = useTranslation('library');
  const { initialShowTrash = false, lockScope = false } = options;
  const [meetings, setMeetings] = useState<MeetingWithPreview[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [sortField, setSortFieldState] = useState<SortField>('date');
  const [sortDirection, setSortDirectionState] = useState<SortDirection>('desc');
  const [viewMode, setViewModeState] = useState<ViewMode>('card');
  const [showTrash, setShowTrash] = useState(initialShowTrash);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const searchTimerRef = useRef<number | null>(null);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const db = await getDb();
      const orderBy = toSortClause(sortField, sortDirection);
      const params = buildMeetingFilterParams(filters);

      const rows = await db.select<MeetingWithPreview[]>(
        `SELECT
           m.id,
           m.title,
           m.started_at,
           m.ended_at,
           m.duration_seconds,
           m.status,
           m.audio_path,
           m.audio_sources,
           m.created_at,
           m.updated_at,
           m.deleted_at,
           CASE
             WHEN s.content IS NULL THEN NULL
             ELSE SUBSTR(s.content, 1, 200)
           END AS summary_preview,
           (
             SELECT COUNT(*)
             FROM transcripts t
             WHERE t.meeting_id = m.id
           ) AS segment_count
         FROM meetings m
         LEFT JOIN summaries s ON s.meeting_id = m.id
         WHERE m.deleted_at IS NULL
           AND ($1 = '' OR m.status = $1)
           AND ($2 = 0 OR COALESCE(m.duration_seconds, 0) >= $2)
           AND ($3 = 0 OR COALESCE(m.duration_seconds, 0) < $3)
           AND ($4 = '' OR COALESCE(m.audio_sources, '') = $4)
           AND ($5 = '' OR m.started_at >= $5)
           AND ($6 = '' OR m.started_at < $6)
         ORDER BY ${orderBy}`,
        params,
      );

      setMeetings(rows);
      setSearchResults(null);
    } catch {
      setError('Failed to load meetings from local database.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [filters.audioSource, filters.dateFrom, filters.dateTo, filters.durationRange, filters.status, sortDirection, sortField]);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const db = await getDb();
      const rows = await db.select<MeetingWithPreview[]>(
        `SELECT
           m.id,
           m.title,
           m.started_at,
           m.ended_at,
           m.duration_seconds,
           m.status,
           m.audio_path,
           m.audio_sources,
           m.created_at,
           m.updated_at,
           m.deleted_at,
           CASE
             WHEN s.content IS NULL THEN NULL
             ELSE SUBSTR(s.content, 1, 200)
           END AS summary_preview,
           (
             SELECT COUNT(*)
             FROM transcripts t
             WHERE t.meeting_id = m.id
           ) AS segment_count
         FROM meetings m
         LEFT JOIN summaries s ON s.meeting_id = m.id
         WHERE m.deleted_at IS NOT NULL
         ORDER BY m.deleted_at DESC`,
      );

      setMeetings(rows);
      setSearchResults(null);
    } catch {
      setError('Failed to load trash from local database.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  const searchMeetings = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (!cleaned) {
      await loadMeetings();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = await getDb();
      const rows = await db.select<SearchResult[]>(
        `SELECT
           m.id,
           m.title,
           m.started_at,
           m.status,
           m.duration_seconds,
           m.audio_sources,
           snippet(meetings_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
         FROM meetings_fts
         JOIN meetings m ON m.id = meetings_fts.rowid
         WHERE meetings_fts MATCH $1
           AND m.deleted_at IS NULL
         ORDER BY bm25(meetings_fts)
         LIMIT 50`,
        [sanitizeFtsQuery(cleaned)],
      );

      setSearchResults(rows);
      setMeetings([]);
    } catch {
      setError('Search failed. Try a different query.');
      setSearchResults([]);
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [loadMeetings]);

  const refresh = useCallback(async () => {
    if (showTrash) {
      await loadTrash();
      return;
    }

    if (filters.search.trim()) {
      await searchMeetings(filters.search);
      return;
    }

    await loadMeetings();
  }, [filters.search, loadMeetings, loadTrash, searchMeetings, showTrash]);

  const setFilter = useCallback(
    <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => {
      setFilters((previous) => ({
        ...previous,
        [key]: value,
      }));
      deselectAll();
    },
    [deselectAll],
  );

  const clearFilters = useCallback(() => {
    setFilters((previous) => ({
      ...DEFAULT_FILTERS,
      search: previous.search,
    }));
    deselectAll();
  }, [deselectAll]);

  const setSortField = useCallback(
    (field: SortField) => {
      setSortFieldState(field);
      deselectAll();
    },
    [deselectAll],
  );

  const setSortDirection = useCallback(
    (direction: SortDirection) => {
      setSortDirectionState(direction);
      deselectAll();
    },
    [deselectAll],
  );

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
  }, []);

  const toggleTrash = useCallback(() => {
    if (lockScope) {
      return;
    }

    setShowTrash((previous) => !previous);
    setFilters((previous) => ({
      ...previous,
      search: '',
    }));
    setSearchResults(null);
    deselectAll();
  }, [deselectAll, lockScope]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(getVisibleLibraryIds(meetings, searchResults)));
  }, [meetings, searchResults]);

  const startRename = useCallback((meetingId: number, currentTitle: string) => {
    setEditingId(meetingId);
    setEditTitle(currentTitle);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditTitle('');
  }, []);

  const commitRename = useCallback(async () => {
    if (editingId === null) {
      return false;
    }

    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      cancelRename();
      return false;
    }

    try {
      await invoke('update_meeting_title', {
        meetingId: editingId,
        title: nextTitle,
      });

      setMeetings((previous) =>
        previous.map((meeting) => (meeting.id === editingId ? { ...meeting, title: nextTitle } : meeting)),
      );
      setSearchResults((previous) =>
        previous?.map((result) => (result.id === editingId ? { ...result, title: nextTitle } : result)) ?? null,
      );
      cancelRename();
      return true;
    } catch {
      setError('Failed to rename meeting title.');
      return false;
    }
  }, [cancelRename, editTitle, editingId]);

  useEffect(() => {
    void invoke('purge_old_trash').catch(() => undefined);
  }, []);

  useEffect(() => {
    if (showTrash) {
      void loadTrash();
      return;
    }

    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = window.setTimeout(() => {
      void searchMeetings(filters.search);
    }, 300);

    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [filters.search, loadTrash, searchMeetings, showTrash]);

  useEffect(() => {
    if (showTrash || filters.search.trim().length > 0) {
      return;
    }

    void loadMeetings();
  }, [filters.search, loadMeetings, showTrash]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void Promise.all([
      listen('sessions-recovered', () => {
        if (!disposed) {
          void refresh();
        }
      }),
      listen('session-state-changed', () => {
        if (!disposed) {
          void refresh();
        }
      }),
    ]).then((listeners) => {
      if (disposed) {
        listeners.forEach((cleanup) => cleanup());
        return;
      }
      unlisteners.push(...listeners);
    });

    return () => {
      disposed = true;
      unlisteners.forEach((cleanup) => cleanup());
    };
  }, [refresh]);

  useEffect(() => {
    const visibleIds = getVisibleLibraryIds(meetings, searchResults);

    setSelectedIds((previous) => pruneSelectedIds(previous, visibleIds));
  }, [meetings, searchResults]);

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sections = useMemo(
    () =>
      groupByDateSection(meetings, locale, {
        today: t('section_today'),
        yesterday: t('section_yesterday'),
        thisWeek: t('section_thisWeek'),
      }),
    [locale, meetings, t],
  );
  const isSelectionMode = selectedIds.size > 0;

  return {
    meetings,
    searchResults,
    sections,
    filters,
    sortField,
    sortDirection,
    viewMode,
    showTrash,
    loading,
    hasLoadedOnce,
    error,
    selectedIds,
    isSelectionMode,
    editingId,
    editTitle,
    setEditTitle,
    setFilter,
    clearFilters,
    setSortField,
    setSortDirection,
    setViewMode,
    toggleTrash,
    toggleSelect,
    selectAll,
    deselectAll,
    startRename,
    commitRename,
    cancelRename,
    refresh,
  };
}
