import { endOfMonth, endOfToday, format, startOfMonth, startOfToday, startOfWeek } from 'date-fns';
import { LayoutGrid, List, Search, Trash2, X } from 'lucide-react';
import type { LibraryFilters, SortDirection, SortField, ViewMode } from '../../types';

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
    'rounded-full border px-2.5 py-1 text-xs font-medium transition',
    active
      ? 'border-accent bg-accent-light/60 text-warm-900 dark:border-accent dark:bg-accent/20 dark:text-warm-50'
      : 'border-warm-300/80 bg-white/70 text-warm-600 hover:bg-warm-100 dark:border-warm-600 dark:bg-warm-800/60 dark:text-warm-200 dark:hover:bg-warm-700',
  ].join(' ');
}

function toInputDate(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

const sortOptions: Array<{ label: string; field: SortField; direction: SortDirection }> = [
  { label: 'Newest', field: 'date', direction: 'desc' },
  { label: 'Oldest', field: 'date', direction: 'asc' },
  { label: 'Longest', field: 'duration', direction: 'desc' },
  { label: 'Shortest', field: 'duration', direction: 'asc' },
  { label: 'A-Z', field: 'title', direction: 'asc' },
  { label: 'Z-A', field: 'title', direction: 'desc' },
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

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-warm-200/80 bg-white/70 p-3 dark:border-warm-700/70 dark:bg-warm-900/30">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 dark:text-warm-400" />
          <input
            value={filters.search}
            onChange={(event) => onFilterChange('search', event.target.value)}
            placeholder="Search meetings..."
            className="w-full rounded-lg border border-warm-300/80 bg-warm-50/80 py-2 pl-9 pr-3 text-sm text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-600 dark:bg-warm-900/70 dark:text-warm-100"
          />
        </label>

        <select
          value={filters.status}
          onChange={(event) => onFilterChange('status', event.target.value as LibraryFilters['status'])}
          className="rounded-full border border-warm-300/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-100"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="recovered">Recovered</option>
          <option value="failed">Failed</option>
          <option value="processing">Processing</option>
          <option value="recording">Recording</option>
          <option value="paused">Paused</option>
        </select>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onFilterChange('durationRange', 'all')}
            className={chipClasses(filters.durationRange === 'all')}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('durationRange', 'short')}
            className={chipClasses(filters.durationRange === 'short')}
          >
            Short &lt;15m
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('durationRange', 'medium')}
            className={chipClasses(filters.durationRange === 'medium')}
          >
            15-60m
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('durationRange', 'long')}
            className={chipClasses(filters.durationRange === 'long')}
          >
            Long &gt;1h
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onFilterChange('audioSource', '')}
            className={chipClasses(filters.audioSource === '')}
          >
            All Audio
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('audioSource', 'mic')}
            className={chipClasses(filters.audioSource === 'mic')}
          >
            Mic
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('audioSource', 'system')}
            className={chipClasses(filters.audioSource === 'system')}
          >
            System
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('audioSource', 'both')}
            className={chipClasses(filters.audioSource === 'both')}
          >
            Both
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => applyDatePreset('today')} className={chipClasses(false)}>
            Today
          </button>
          <button type="button" onClick={() => applyDatePreset('week')} className={chipClasses(false)}>
            This Week
          </button>
          <button type="button" onClick={() => applyDatePreset('month')} className={chipClasses(false)}>
            This Month
          </button>
          <button type="button" onClick={() => applyDatePreset('custom')} className={chipClasses(false)}>
            Custom
          </button>

          {(filters.dateFrom || filters.dateTo) && (
            <button type="button" onClick={() => applyDatePreset('clear')} className={chipClasses(false)}>
              <X size={11} />
            </button>
          )}
        </div>

        {(filters.dateFrom || filters.dateTo) && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onFilterChange('dateFrom', event.target.value)}
              className="rounded-full border border-warm-300/80 bg-white/80 px-3 py-1 text-xs text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-100"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange('dateTo', event.target.value)}
              className="rounded-full border border-warm-300/80 bg-white/80 px-3 py-1 text-xs text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-100"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={sortValue}
            onChange={(event) => {
              const [field, direction] = event.target.value.split(':') as [SortField, SortDirection];
              onSortChange(field, direction);
            }}
            className="rounded-full border border-warm-300/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-warm-700 outline-none ring-accent transition focus:ring-2 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-100"
          >
            {sortOptions.map((option) => (
              <option key={`${option.field}-${option.direction}`} value={`${option.field}:${option.direction}`}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-full border border-warm-300/80 bg-white/70 p-0.5 dark:border-warm-600 dark:bg-warm-800/70">
            <button
              type="button"
              onClick={() => onViewModeChange('card')}
              className={[
                'rounded-full px-2 py-1 transition',
                viewMode === 'card' ? 'bg-accent text-white' : 'text-warm-500 hover:text-warm-700 dark:text-warm-300',
              ].join(' ')}
              aria-label="Card view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('compact')}
              className={[
                'rounded-full px-2 py-1 transition',
                viewMode === 'compact' ? 'bg-accent text-white' : 'text-warm-500 hover:text-warm-700 dark:text-warm-300',
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
              'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              showTrash
                ? 'border-red-300 bg-red-100/80 text-red-700 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-200'
                : 'border-warm-300/80 bg-white/80 text-warm-700 hover:bg-warm-100 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-100',
            ].join(' ')}
          >
            <Trash2 size={13} />
            Trash
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-full border border-warm-300/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-warm-600 transition hover:bg-warm-100 dark:border-warm-600 dark:bg-warm-800/70 dark:text-warm-200"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-warm-500 dark:text-warm-300">
          <span>Active:</span>
          {filters.status ? (
            <button type="button" onClick={() => onFilterChange('status', '')} className={chipClasses(true)}>
              Status: {filters.status}
            </button>
          ) : null}
          {filters.durationRange !== 'all' ? (
            <button type="button" onClick={() => onFilterChange('durationRange', 'all')} className={chipClasses(true)}>
              Duration: {filters.durationRange}
            </button>
          ) : null}
          {filters.audioSource ? (
            <button type="button" onClick={() => onFilterChange('audioSource', '')} className={chipClasses(true)}>
              Audio: {filters.audioSource}
            </button>
          ) : null}
          {filters.dateFrom || filters.dateTo ? (
            <button type="button" onClick={() => applyDatePreset('clear')} className={chipClasses(true)}>
              Date: {filters.dateFrom || '...'} to {filters.dateTo || '...'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
