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
  return active
    ? 'rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-medium text-accent dark:bg-[rgba(59,130,246,0.12)] dark:text-accent-muted'
    : 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';
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
    <div className="mt-4 space-y-3 border-b border-gray-200 pb-4 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400" />
          <input
            value={filters.search}
            onChange={(event) => onFilterChange('search', event.target.value)}
            placeholder="Search meetings..."
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>

        <select
          value={filters.status}
          onChange={(event) => onFilterChange('status', event.target.value as LibraryFilters['status'])}
          className="rounded-md border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
              className="rounded-md border border-gray-200 bg-white/80 px-3 py-1 text-xs text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange('dateTo', event.target.value)}
              className="rounded-md border border-gray-200 bg-white/80 px-3 py-1 text-xs text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
            className="rounded-md border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 outline-none ring-accent transition focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {sortOptions.map((option) => (
              <option key={`${option.field}-${option.direction}`} value={`${option.field}:${option.direction}`}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-md bg-gray-100 p-0.5 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => onViewModeChange('card')}
              className={[
                'rounded-md px-2 py-1 transition',
                viewMode === 'card' ? 'bg-accent-subtle text-accent dark:bg-[rgba(59,130,246,0.12)] dark:text-accent-muted' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300',
              ].join(' ')}
              aria-label="Card view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('compact')}
              className={[
                'rounded-md px-2 py-1 transition',
                viewMode === 'compact' ? 'bg-accent-subtle text-accent dark:bg-[rgba(59,130,246,0.12)] dark:text-accent-muted' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300',
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
              'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
              showTrash
                ? 'border border-red-300 bg-red-100/80 text-red-700 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100',
            ].join(' ')}
          >
            <Trash2 size={13} />
            Trash
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
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
