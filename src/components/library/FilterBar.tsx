import { endOfMonth, endOfToday, format, startOfMonth, startOfToday, startOfWeek } from 'date-fns';
import {
  ArrowDownAZ,
  ArrowUpZA,
  Calendar,
  Clock,
  LayoutGrid,
  List,
  Search,
  SortDesc,
  Trash2,
  X,
} from 'lucide-react';
import type { LibraryFilters, SortDirection, SortField, ViewMode } from '../../types';
import { Dropdown } from '../ui/Dropdown';

type FilterBarProps = {
  filters: LibraryFilters;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  showTrash: boolean;
  onFilterChange: <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => void;
  onClearFilters: () => void;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleTrash: () => void;
};

function chipClasses(active: boolean): string {
  return [
    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
    active
      ? 'bg-accent/10 text-accent ring-1 ring-accent/20 shadow-sm dark:bg-accent/15 dark:text-accent-muted dark:ring-accent/25'
      : 'bg-gray-100/60 text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:bg-gray-800/40 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200',
  ].join(' ');
}

function toInputDate(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

type SortOption = { label: string; field: SortField; direction: SortDirection };
const sortOptions: SortOption[] = [
  { label: 'Newest', field: 'date', direction: 'desc' },
  { label: 'Oldest', field: 'date', direction: 'asc' },
  { label: 'Longest', field: 'duration', direction: 'desc' },
  { label: 'Shortest', field: 'duration', direction: 'asc' },
  { label: 'A \u2192 Z', field: 'title', direction: 'asc' },
  { label: 'Z \u2192 A', field: 'title', direction: 'desc' },
];

function sortIcon(field: SortField, direction: SortDirection) {
  if (field === 'title') {
    return direction === 'asc' ? <ArrowDownAZ size={12} /> : <ArrowUpZA size={12} />;
  }
  if (field === 'duration') {
    return <Clock size={12} />;
  }
  return <SortDesc size={12} />;
}

const statusOptions = [
  { value: '' as const, label: 'All statuses' },
  { value: 'completed' as const, label: 'Completed' },
  { value: 'recovered' as const, label: 'Recovered' },
  { value: 'failed' as const, label: 'Failed' },
  { value: 'processing' as const, label: 'Processing' },
  { value: 'recording' as const, label: 'Recording' },
  { value: 'paused' as const, label: 'Paused' },
];

export function FilterBar({
  filters,
  sortField,
  sortDirection,
  viewMode,
  showTrash,
  onFilterChange,
  onClearFilters,
  onSortChange,
  onViewModeChange,
  onToggleTrash,
}: FilterBarProps) {
  const sortValue = `${sortField}:${sortDirection}`;
  const hasActiveFilters =
    filters.status !== '' ||
    filters.durationRange !== 'all' ||
    filters.audioSource !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'custom' | 'clear') => {
    if (preset === 'clear') {
      onFilterChange('dateFrom', '');
      onFilterChange('dateTo', '');
      return;
    }

    if (preset === 'custom') {
      const today = toInputDate(new Date());
      onFilterChange('dateFrom', today);
      onFilterChange('dateTo', today);
      return;
    }

    if (preset === 'today') {
      onFilterChange('dateFrom', toInputDate(startOfToday()));
      onFilterChange('dateTo', toInputDate(endOfToday()));
      return;
    }

    if (preset === 'week') {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      onFilterChange('dateFrom', toInputDate(weekStart));
      onFilterChange('dateTo', toInputDate(endOfToday()));
      return;
    }

    onFilterChange('dateFrom', toInputDate(startOfMonth(new Date())));
    onFilterChange('dateTo', toInputDate(endOfMonth(new Date())));
  };

  const activeDatePreset = (): string | null => {
    if (!filters.dateFrom && !filters.dateTo) return null;
    const from = filters.dateFrom;
    const to = filters.dateTo;
    const todayStr = toInputDate(startOfToday());
    const endTodayStr = toInputDate(endOfToday());
    const weekStartStr = toInputDate(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const monthStartStr = toInputDate(startOfMonth(new Date()));
    const monthEndStr = toInputDate(endOfMonth(new Date()));

    if (from === todayStr && to === endTodayStr) return 'today';
    if (from === weekStartStr && to === endTodayStr) return 'week';
    if (from === monthStartStr && to === monthEndStr) return 'month';
    return 'custom';
  };

  const datePreset = activeDatePreset();

  return (
    <div className="mt-5 space-y-3 border-b border-gray-200/50 pb-4 dark:border-gray-800/50">
      {/* Row 1: Search + Status + Duration */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.search}
            onChange={(event) => onFilterChange('search', event.target.value)}
            placeholder="Search meetings..."
            className={[
              'w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-all duration-150',
              'border border-gray-200/60 bg-white/50 text-gray-700 placeholder-gray-400 shadow-sm',
              'hover:border-gray-300/70 focus:border-accent/40 focus:ring-2 focus:ring-accent/20 focus:bg-white/80',
              'dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-100 dark:placeholder-gray-500',
              'dark:hover:border-gray-600/70 dark:focus:border-accent/40 dark:focus:bg-gray-800/60',
            ].join(' ')}
          />
        </label>

        <Dropdown
          value={filters.status}
          options={statusOptions}
          onChange={(val) => onFilterChange('status', val as LibraryFilters['status'])}
          placeholder="All statuses"
        />

        <div className="flex items-center gap-1 rounded-xl bg-gray-100/40 p-0.5 dark:bg-gray-800/30">
          <button type="button" onClick={() => onFilterChange('durationRange', 'all')} className={chipClasses(filters.durationRange === 'all')}>
            All
          </button>
          <button type="button" onClick={() => onFilterChange('durationRange', 'short')} className={chipClasses(filters.durationRange === 'short')}>
            &lt;15m
          </button>
          <button type="button" onClick={() => onFilterChange('durationRange', 'medium')} className={chipClasses(filters.durationRange === 'medium')}>
            15-60m
          </button>
          <button type="button" onClick={() => onFilterChange('durationRange', 'long')} className={chipClasses(filters.durationRange === 'long')}>
            &gt;1h
          </button>
        </div>
      </div>

      {/* Row 2: Audio source + Date presets + Sort + View + Trash */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-gray-100/40 p-0.5 dark:bg-gray-800/30">
          <button type="button" onClick={() => onFilterChange('audioSource', '')} className={chipClasses(filters.audioSource === '')}>
            All Audio
          </button>
          <button type="button" onClick={() => onFilterChange('audioSource', 'mic')} className={chipClasses(filters.audioSource === 'mic')}>
            Mic
          </button>
          <button type="button" onClick={() => onFilterChange('audioSource', 'system')} className={chipClasses(filters.audioSource === 'system')}>
            System
          </button>
          <button type="button" onClick={() => onFilterChange('audioSource', 'both')} className={chipClasses(filters.audioSource === 'both')}>
            Both
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-gray-100/40 p-0.5 dark:bg-gray-800/30">
          <button type="button" onClick={() => applyDatePreset('today')} className={chipClasses(datePreset === 'today')}>
            Today
          </button>
          <button type="button" onClick={() => applyDatePreset('week')} className={chipClasses(datePreset === 'week')}>
            This Week
          </button>
          <button type="button" onClick={() => applyDatePreset('month')} className={chipClasses(datePreset === 'month')}>
            This Month
          </button>
          <button type="button" onClick={() => applyDatePreset('custom')} className={chipClasses(datePreset === 'custom')}>
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              Custom
            </span>
          </button>
          {datePreset !== null && (
            <button
              type="button"
              onClick={() => applyDatePreset('clear')}
              className="rounded-lg p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-200/70 hover:text-gray-600 dark:hover:bg-gray-700/60 dark:hover:text-gray-200"
              aria-label="Clear date filter"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {(filters.dateFrom || filters.dateTo) && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onFilterChange('dateFrom', event.target.value)}
              className={[
                'rounded-lg border border-gray-200/60 bg-white/50 px-2.5 py-1.5 text-xs text-gray-700 shadow-sm',
                'outline-none transition-all duration-150',
                'focus:border-accent/40 focus:ring-2 focus:ring-accent/20',
                'dark:border-gray-700/60 dark:bg-gray-800/50 dark:text-gray-200',
              ].join(' ')}
            />
            <span className="text-xs text-gray-400">&ndash;</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange('dateTo', event.target.value)}
              className={[
                'rounded-lg border border-gray-200/60 bg-white/50 px-2.5 py-1.5 text-xs text-gray-700 shadow-sm',
                'outline-none transition-all duration-150',
                'focus:border-accent/40 focus:ring-2 focus:ring-accent/20',
                'dark:border-gray-700/60 dark:bg-gray-800/50 dark:text-gray-200',
              ].join(' ')}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Dropdown
            value={sortValue}
            options={sortOptions.map((o) => ({
              value: `${o.field}:${o.direction}`,
              label: o.label,
              icon: sortIcon(o.field, o.direction),
            }))}
            onChange={(val) => {
              const [field, direction] = val.split(':') as [SortField, SortDirection];
              onSortChange(field, direction);
            }}
            placeholder="Sort by"
          />

          <div className="inline-flex items-center rounded-lg bg-gray-100/50 p-0.5 dark:bg-gray-800/40">
            <button
              type="button"
              onClick={() => onViewModeChange('card')}
              className={[
                'rounded-md px-2 py-1.5 transition-all duration-150 cursor-pointer',
                viewMode === 'card'
                  ? 'bg-white text-accent shadow-sm dark:bg-gray-700/80 dark:text-accent-muted'
                  : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              ].join(' ')}
              aria-label="Card view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('compact')}
              className={[
                'rounded-md px-2 py-1.5 transition-all duration-150 cursor-pointer',
                viewMode === 'compact'
                  ? 'bg-white text-accent shadow-sm dark:bg-gray-700/80 dark:text-accent-muted'
                  : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              ].join(' ')}
              aria-label="Compact view"
            >
              <List size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleTrash}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
              showTrash
                ? 'bg-red-500/10 text-red-600 ring-1 ring-red-500/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25'
                : 'bg-gray-100/50 text-gray-500 hover:bg-gray-200/70 hover:text-gray-700 dark:bg-gray-800/40 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200',
            ].join(' ')}
          >
            <Trash2 size={13} />
            Trash
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-all duration-150 hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200 cursor-pointer"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.status && (
            <button
              type="button"
              onClick={() => onFilterChange('status', '')}
              className="inline-flex items-center gap-1 rounded-full bg-accent/8 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors duration-150 hover:bg-accent/15 dark:bg-accent/12 dark:text-accent-muted dark:hover:bg-accent/20 cursor-pointer"
            >
              Status: {filters.status}
              <X size={10} />
            </button>
          )}
          {filters.durationRange !== 'all' && (
            <button
              type="button"
              onClick={() => onFilterChange('durationRange', 'all')}
              className="inline-flex items-center gap-1 rounded-full bg-accent/8 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors duration-150 hover:bg-accent/15 dark:bg-accent/12 dark:text-accent-muted dark:hover:bg-accent/20 cursor-pointer"
            >
              Duration: {filters.durationRange}
              <X size={10} />
            </button>
          )}
          {filters.audioSource && (
            <button
              type="button"
              onClick={() => onFilterChange('audioSource', '')}
              className="inline-flex items-center gap-1 rounded-full bg-accent/8 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors duration-150 hover:bg-accent/15 dark:bg-accent/12 dark:text-accent-muted dark:hover:bg-accent/20 cursor-pointer"
            >
              Audio: {filters.audioSource}
              <X size={10} />
            </button>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <button
              type="button"
              onClick={() => applyDatePreset('clear')}
              className="inline-flex items-center gap-1 rounded-full bg-accent/8 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors duration-150 hover:bg-accent/15 dark:bg-accent/12 dark:text-accent-muted dark:hover:bg-accent/20 cursor-pointer"
            >
              Date: {filters.dateFrom || '\u2026'} to {filters.dateTo || '\u2026'}
              <X size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
